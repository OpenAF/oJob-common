"""Run with OPENAF_JAR pointing to a build that includes MCP workflows."""
import contextlib
import http.server
import json
import os
from pathlib import Path
import select
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
JAVA = ["java", "-jar", str(Path(os.environ["OPENAF_JAR"]).resolve())]
TASKS = "io.modelcontextprotocol/tasks"
CAPS = {"extensions": {TASKS: {}}, "elicitation": {"form": {}}}
STEPS = {
    "Form": """
      if (isUnDef(args.mcp)) {
        args.text = "sync fallback"
      } else if (isDef(args.mcp.inputResponses)) {
        var answer = args.mcp.inputResponses[Object.keys(args.mcp.inputResponses)[0]]
        args.text = answer.action + ":" + args.mcp.state.marker
      } else {
        if (isDef(args.mcp.progress)) args.mcp.progress("Waiting for approval")
        args.mcpResult = {
          status: "input_required", state: { marker: "fixture" },
          form: { message: "Approve?", requestedSchema: { type: "object",
            properties: { approve: { type: "boolean" } }, required: ["approve"] } }
        }
      }
    """,
    "External Start": 'args.mcpResult = { ref: "external-" + args.mcp.taskId }',
    "External Status": """
      if (io.fileExists(args.marker))
        args.mcpResult = { status: "completed", result: { content: [{ type: "text", text: args.mcp.ref }], isError: true } }
      else {
        args.text = "external pending"
        args.mcpResult = { status: "working", statusMessage: args.text }
      }
    """,
    "External Cancel": 'io.writeFileString(args.marker, args.mcp.ref)',
    "Long Job": """
      args.mcp.progress("started")
      while (!args.mcp.isCancelled()) sleep(25, true)
      args.text = "late completion"
    """,
    "Plain": 'args.text = "ordinary"',
}


def message(method, params, caps):
    return {"jsonrpc": "2.0", "id": 1, "method": method, "params": {
        **params, "_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28",
                            "io.modelcontextprotocol/clientCapabilities": caps}
    }}


@contextlib.contextmanager
def process(config):
    with config.with_suffix(".log").open("w+") as log:
        proc = subprocess.Popen(
            JAVA + ["--ojob", "-e", str(config)], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE if config.stem == "stdio" else log, stderr=log, text=True
        )
        try:
            yield proc
        except Exception:
            log.seek(0)
            print(log.read())
            raise
        finally:
            if proc.poll() is None:
                if proc.stdout is not None:
                    proc.stdin.close()
                else:
                    proc.terminate()
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
            if proc.stdout is not None:
                proc.stdout.close()


def fixture(path, validator=None, port=None, stream=False):
    todo = {
        "((modern))": True, "((taskStore))": f"{path.stem}.mv",
        "((fns))": {"inline": "Form", "managed": "Form", "ordinary": "Plain",
                    "external": "Plain", "long": "Long Job", "strict": "Long Job"},
        "((workflows))": {
            "inline": {"mode": "inline", "elicitation": True},
            "managed": {"mode": "managed", "elicitation": True, "fallback": "sync"},
            "external": {"mode": "external", "start": "External Start", "status": "External Status", "cancel": "External Cancel"},
            "long": {"mode": "managed"}, "strict": {"mode": "managed"},
        },
    }
    if port:
        todo.update({"(httpdMCP)": port, "((authapiurl))": validator, "((usestream))": stream,
                     "((authapicachettl))": 60000})
        jobs = [{"(httpdStart)": port, "((host))": "127.0.0.1"}, todo]
    else:
        todo["(stdioMCP)"] = {"serverInfo": {"name": "workflow-fixture"}}
        jobs = [todo]
    path.write_text(json.dumps({
        "include": [str(ROOT / "oJobMCP.yaml")],
        "ojob": {"logToConsole": False, "daemon": bool(port), "catch": "printErr(exception)"},
        "todo": jobs, "jobs": [{"name": name, "exec": script} for name, script in STEPS.items()],
    }))


def stdio_call(proc):
    def call(method, caps=CAPS, **params):
        proc.stdin.write(json.dumps(message(method, params, caps)) + "\n")
        proc.stdin.flush()
        assert select.select([proc.stdout], [], [], 10)[0], "stdio reply timed out"
        reply = json.loads(proc.stdout.readline())
        return reply.get("result", reply.get("error"))
    return call


def http_call(port):
    def call(method, token="original", caps=CAPS, **params):
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
                   "Authorization": "Bearer " + token, "Mcp-Method": method}
        if "taskId" in params or "name" in params:
            headers["Mcp-Name"] = params.get("taskId", params.get("name"))
        request = urllib.request.Request(f"http://127.0.0.1:{port}/mcp",
                                        json.dumps(message(method, params, caps)).encode(), headers)
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                body = response.read().decode()
                if response.headers.get_content_type() == "text/event-stream":
                    body = next(line[6:] for line in body.splitlines() if line.startswith("data: "))
                reply = json.loads(body)
                return reply.get("result", reply.get("error"))
        except urllib.error.HTTPError as error:
            return {"http": error.code}
    return call


def until(fn):
    for _ in range(100):
        value = fn()
        if value:
            return value
        time.sleep(.1)
    raise AssertionError("MCP fixture timed out")


def wait_for_task(call, handle, status, note=None):
    def reached():
        result = call("tasks/get", taskId=handle)
        if result.get("status") == status and (note is None or result.get("statusMessage") == note):
            return result
        assert result.get("status") not in ("failed", "completed", "cancelled"), result
    return until(reached)


def check_forms(call):
    assert TASKS in call("server/discover")["capabilities"]["extensions"]
    assert call("tools/call", caps={}, name="strict")["code"] == -32021
    assert "sync fallback" in call("tools/call", caps={}, name="managed", arguments={
        "mcp": {"state": {"marker": "untrusted"}, "inputResponses": {"x": {"action": "accept"}}}
    })["content"][0]["text"]
    assert call("tools/call", caps={}, name="inline")["code"] == -32021
    assert call("tools/call", name="managed", arguments={"nested": {"__proto__": {"bad": True}}})["code"] == -32602
    challenge = call("tools/call", name="inline", arguments={"payload": 1})
    assert challenge["resultType"] == "input_required"
    key = next(iter(challenge["inputRequests"]))
    continuation = {"requestState": challenge["requestState"], "inputResponses": {key: {"action": "cancel"}}}
    assert call("tools/call", name="inline", arguments={"payload": 2}, **continuation)["code"] == -32602
    assert call("tools/call", name="inline", arguments={"payload": 1}, **continuation)["content"][0]["text"] == "cancel:fixture"
    assert call("tools/call", name="inline", arguments={"payload": 1}, **continuation)["code"] == -32602

    task = call("tools/call", name="managed")["taskId"]
    challenge = wait_for_task(call, task, "input_required", "Waiting for approval")
    key = next(iter(challenge["inputRequests"]))
    assert call("tasks/update", taskId=task, inputResponses={key: {"action": "accept", "content": {}}})["code"] == -32602
    answers = {key: {"action": "accept", "content": {"approve": True}}}
    for _ in range(2):
        assert call("tasks/update", taskId=task, inputResponses=answers)["resultType"] == "complete"
    assert wait_for_task(call, task, "completed")["result"]["content"][0]["text"] == "accept:fixture"


class Validator(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        credential = self.headers.get("Authorization")
        self.send_response(200 if credential in ("Bearer original", "Bearer rotated", "Bearer other", "Bearer missing") else 401)
        if credential in ("Bearer original", "Bearer rotated"):
            self.send_header("X-OJob-MCP-Principal", "author")
        if credential == "Bearer other":
            self.send_header("X-OJob-MCP-Principal", "other")
        self.end_headers()

    def log_message(self, *_):
        pass


def check_openaf_client(path, port):
    source = path / "test-client.js"
    source.write_text("""
      var client = $mcp({url: "http://127.0.0.1:" + getEnv("MCP_FIXTURE_PORT") + "/mcp",
        protocolVersion: "auto", tasks: true, auth: {type: "bearer", token: "original"}})
      try {
        client.onElicitationRequest(() => ({action: "accept", content: {approve: true}}))
        client.initialize()
        var challenge = client.callTool("inline", {})
        var reply = client.continueRequest("tools/call", {name: "inline", arguments: {}}, challenge)
        if (reply.content[0].text !== "accept:fixture") throw new Error("Invalid inline continuation")
        var handle = client.callTool("managed", {})
        var deadline = now() + 7000, task
        do {
          task = client.getTask(handle.taskId)
          if (task.status === "input_required") client.continueTask(task)
          if (task.status === "completed") break
          sleep(100, true)
        } while (now() < deadline)
        if (task.status !== "completed" || task.result.content[0].text !== "accept:fixture")
          throw new Error("Invalid client task result")
        var started = client.callTool("long", {})
        client.cancelTask(started.taskId)
        if (client.getTask(started.taskId).status !== "cancelled") throw new Error("Invalid cancellation")
        print("PASS OpenAF task client")
      } finally { client.destroy() }
    """)
    outcome = subprocess.run(JAVA + ["-f", str(source)], text=True, capture_output=True, timeout=20,
                             env={**os.environ, "MCP_FIXTURE_PORT": str(port)})
    assert outcome.returncode == 0 and "PASS OpenAF task client" in outcome.stdout, outcome.stdout + outcome.stderr


def tcp_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    with tempfile.TemporaryDirectory(prefix="mcp-workflows-") as tmp:
        path = Path(tmp)
        config = path / "stdio.yaml"
        fixture(config)
        completed_marker = path / "external-finished"
        with process(config) as proc:
            call = stdio_call(proc)
            check_forms(call)
            paused = call("tools/call", name="managed")["taskId"]
            waiting = wait_for_task(call, paused, "input_required")
            running = call("tools/call", name="long")["taskId"]
            wait_for_task(call, running, "working", "started")
            external = call("tools/call", name="external", arguments={"marker": str(completed_marker)})["taskId"]
            wait_for_task(call, external, "working", "external pending")
            proc.kill()
            proc.wait()
        with process(config) as proc:
            call = stdio_call(proc)
            assert call("tasks/get", taskId=running)["status"] == "failed"
            assert call("tasks/get", taskId=paused)["inputRequests"] == waiting["inputRequests"]
            key = next(iter(waiting["inputRequests"]))
            call("tasks/update", taskId=paused, inputResponses={key: {"action": "decline"}})
            assert wait_for_task(call, paused, "completed")["result"]["content"][0]["text"] == "decline:fixture"
            completed_marker.touch()
            result = wait_for_task(call, external, "completed")["result"]
            assert result["content"][0]["text"] == "external-" + external and result["isError"] is True

            workers = [call("tools/call", name="long")["taskId"] for _ in range(4)]
            for handle in workers:
                wait_for_task(call, handle, "working", "started")
            queued = [call("tools/call", name="long")["taskId"] for _ in range(64)]
            assert call("tools/call", name="long")["code"] == -32603
            for handle in queued + workers:
                assert call("tasks/cancel", taskId=handle)["resultType"] == "complete"
                assert call("tasks/get", taskId=handle)["status"] == "cancelled"
            marker = path / "external-cancelled"
            cancelled = call("tools/call", name="external", arguments={"marker": str(marker)})["taskId"]
            wait_for_task(call, cancelled, "working", "external pending")
            call("tasks/cancel", taskId=cancelled)
            until(marker.is_file)
            assert marker.read_text() == "external-" + cancelled
        print("PASS stdio forms, task capacity, restart recovery, reattachment and cancellation")

        with http.server.ThreadingHTTPServer(("127.0.0.1", 0), Validator) as validator:
            threading.Thread(target=validator.serve_forever, daemon=True).start()
            try:
                for stream in (False, True):
                    port = tcp_port()
                    config = path / ("sse.yaml" if stream else "http.yaml")
                    fixture(config, f"http://127.0.0.1:{validator.server_port}/auth", port, stream)
                    with process(config):
                        call = http_call(port)
                        def ready():
                            try:
                                return "capabilities" in call("server/discover")
                            except OSError:
                                return False
                        until(ready)
                        check_forms(call)
                        task = call("tools/call", name="managed")["taskId"]
                        assert call("tasks/get", taskId=task, token="rotated")["taskId"] == task
                        assert call("tasks/get", taskId=task, token="other")["code"] == -32602
                        assert call("tasks/cancel", taskId=task, token="other")["code"] == -32602
                        assert call("tasks/update", taskId=task, inputResponses={}, token="other")["code"] == -32602
                        assert call("tools/call", name="managed", token="missing")["code"] == -32001
                        assert call("tools/call", name="managed", token="invalid")["http"] == 401
                        external_id = call("tools/call", name="external", arguments={"marker": str(completed_marker)})["taskId"]
                        assert wait_for_task(call, external_id, "completed")["result"]["content"][0]["text"] == "external-" + external_id
                        check_openaf_client(path, port)
                    print(f"PASS HTTP {'SSE' if stream else 'JSON'} forms, stable principal and rotation")
            finally:
                validator.shutdown()


if __name__ == "__main__":
    main()
