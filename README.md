# oJob-common

![version](.github/version.svg)

A set of base oJobs as common building blocks for custom oJobs.

Check the documentation for some of them:

| oJob-common | Description |
| ----------- | ----------- |
| [oJobBasics](#ojobbasics) | Basic init/done logging, sh command execution, etc. |
| [oJobEmail](#ojobemail) | Send emails. |
| [oJobSSH](#ojobssh) | SSH to execute commands and upload/download files. |
| [oJobSQL](#ojobsql) | Query or execute SQL to a JDBC database. |
| [oJobES](#ojobes) | Logging to ElasticSearch |
| [oJobNet](#ojobnet) | Testing network connectivity | 
| [oJob](#ojob) | Building a simple HTTP(s) server |
| [oJobRest](#ojobrest) | Building a simple REST server |
| [oJobOPack](#ojobopack) | Simplified OPack creation |
| [oJobRAID](#ojobraid) | Simplified RAID AF operation execution. |
| [oJobWatchDog](#ojobwatchdog) | Helps build a cron-based process "watchdog". |

## oJobBasics

| oJobBasics jobs |
|-----------------|
| [oJob sh](#ojob-sh) |
| [oJob background processes](#ojob-background-processes) |
| [oJob From global](#ojob-from-global) |
| [oJob Args from JSON](#ojob-args-from-json) |
| [oJob Args from YAML](#ojob-args-from-yaml) |
| [oJob Send email](#ojob-send-email) |
| [oJob Jobs Report](#ojob-jobs-report) |

### oJob sh

This job runs a local shell command and accepts the following arguments:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| cmd | String/Array | Yes | The command to execute (or an array of commands) |
| quiet | Boolean | No | Determines if the stdout should be visible or not (default is false) |
| directory | String | No | Sets the working directory for the command |
| stdin | String | No | Provide any stdin needed |
| exitcode | Number | No | Determines what exitcode should be consider success (default is 0) |

Example:

````yaml
include:
  - oJobBasics.yaml

jobs:
  # Example to show 123
  #
  - name: Example Echo 123
    to  : oJob sh
    args:
      cmd: echo 123

  # Example to show how you can combine multiple commands
  #
  - name: Example with multiple commands
    to  : oJob sh
    args:
      cmd:
        - echo -- [You are in `pwd`] -------------

        - >-
          echo -- [Previous directory] ----------- &&
          cd .. &&
          ls -1

        - >-
          echo -- [Current directory] ------------ &&
          cd . &&
          ls -1

  # Example to parse output
  #
  - name: Example to parse output
    from: oJob sh
    args:
      quiet: true
      cmd  : >-
         curl -X GET "https://httpbin.org/json" -H "accept: application/json"

    exec: |
      print("STDOUT   = " + stringify(jsonParse(args.stdout)));
      print("STDERR   = " + args.stderr);
      print("EXITCODE = " + args.exitcode);

  # Example to prepare cmd
  #
  - name: Example to prepare cmd
    to  : oJob sh
    exec: |
      args.cmd = "echo " + new Date();

todo:
  - Example Echo 123
  - Example with multiple commands
  - Example to parse output
  - Example to prepare cmd
````

### oJob background processes

These jobs will run a command in background and wait for all to finish if needed. oJob Process Launch expects:


| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| cmd | String/Array | Yes | The command to execute (or an array of commands) in background. |
| console | Boolean | No | Defines if stdout/stderr should be printed or not (defaults to true) |
| success | String | No | Code to execute as a function in case of success. Receives a "res" map from executing a sh function. |
| error | String | No | Code to execute as a function in case of error. Receives a "e" exception and a "cmd" with the original cmd argument. |

Example:

````yaml
include:
  - oJobBasics.yaml

todo:
  - Launch proc 1
  - Launch proc 2
  - oJob Process Wait

jobs:
  - name: Launch proc 1
    to  :
      - oJob Process Launch
    args:
      cmd    : "myProc1.sh"
      success: "log(stringify(res, void 0, ''));"

  - name: Launch proc 2
    to  :
      - oJob Process Launch
    args:
      cmd : "myProc2.sh"
````

### oJob From global

This job will reset or merge a global variable map. Expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| global | String | Yes | Load arguments from the global variable specified. |

### oJob Args from JSON

This job will load the args map from a JSON file. Expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| file | String | Yes | The filepath to read the JSON file from. |
| global | String | No | Alternatively load to the global variable specified. |

### oJob Args from YAML

This job will load the args map from a YAML file. Expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| file | String | Yes | The filepath to read the YAML file from. |
| global | String | No | Alternatively load to the global variable specified. |

### oJob Jobs Report

This job prints a job execution report on shutdown.

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| format | String | No | Output in json, yaml or table format (defaults to table) |

**Note:** you can also use the job "oJob Jobs Final Report" to output the report on shutdown.

````yaml
include:
  - oJobBasics.yaml

jobs:
  # some jobs

todo:
  - oJob Jobs Final Report
  # some todos
````

## oJobEmail

| oJobEmail jobs |
|-----------------|
| [oJob Send email](#ojob-send-email) |

### oJob Send email

This job tries to send an email. Expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| server | String | Yes | The email server to use. |
| port | Number | No | The email server port to use. |
| from | String | Yes | The email from address. |
| to | Array | Yes | The email to addresses. |
| cc | Array | No | The email cc addresses. |
| bcc | Array | No | The email bcc addresses. |
| isHTML | Boolean | No | Specifies if the email is in HTML format. |
| subject | String | Yes | The email subject (a hbs template using args as data). |
| output | String | Yes | The email body message (a hbs template using args as data). |
| altOutput | String | No | The email body alternative message (defaults to message). |
| credentials | Map | No | The email server credentials (user and pass). | 
| useSSL | Boolean | No | If the email server uses SSL. |
| useTLS | Boolean | No | If the email server uses TLS. |
| embedFiles | Array | No | Array of maps (with file and name) to embeded on the email. |
| addAttachments | Array | No | Array of maps (with file, isInLine, name) to attach on the email. |
| addImages | Array | No | Array of urls to images (only available if isHTML = true)- | 
| embedURLs | Array | No | Array of maps (with url and name) to embeded on the email. |
| debug | Boolean | No | Determines if it should debug the process. |

Example:

smtp-config.yaml
````yaml
from       : my.email@some.domain
server     : my.smtp.server
credentials:
  user: user1
  pass: pass1
useSSL     : true
````

sendEmail.yaml
````yaml
include:
  - oJobEmail.yaml

jobs:
  - name: Send email test
    from: oJob Args from YAML
    to  : oJob Send email
    args:
      file   : smtp-config.yaml
      to     :
        - email1@some.domain
      subject: Test email
      output : My test email

todo:
  - Send email test
````

## oJobSSH

### SSH Exec

Executes commands on a SSH connection. The expected arguments are:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| cmd | String/Array | Yes | A SSH command-line to execute or and array of it (keep in mind that this isn't bash) |
| stdin | String | No | An optional SSH stdin for the command-line to execute |
| chHosts | String | No | A channel with hosts configurations to use instead of individual config |
| host | String | No | The SSH host |
| port | Number | No | The SSH port (defaults to 22) |
| login | String | No | The SSH login |
| pass | String | No | The SSH pass |
| key | String | No | The path to a SSH key file (optional) |
| exitcode | Number | No | Determines what exitcode should be consider success (default is 0) |
| sudo | String | No | Sudo's to the corresponding user to executing the command-line |
| quiet | Boolean | No | Determines if no output of the command(s) execution should be provided (default to false) |

Example:

#### hosts.yaml

````yaml
- name : my host 1
  host : host1.local
  login: user1
  pass : pass1234
  key  : key.rsa

- name : my host 2
  host : host2.local
  login: user1
  pass : pass1234
  key  : key.rsa
````

#### example.yaml

````yaml
include:
  - oJobSSH.yaml

ojob:
  sequential: true

jobs:
  # Example to show 123
  #
  - name: Example Echo 123
    deps:
      - SSH Load hosts
    to  : SSH Exec
    args:
      cmd: echo 123

  # Example to show how you can combine multiple commands
  #
  - name: Example with multiple commands
    deps:
      - SSH Load hosts
    to  : SSH Exec
    args:
      cmd:
        - echo -- [You are in `pwd`] -------------

        - >-
          echo -- [Previous directory] ----------- &&
          cd .. &&
          ls -1

        - >-
          echo -- [Current directory] ------------ &&
          cd . &&
          ls -1

  # Example to parse output
  #
  - name: Example to parse output
    deps:
      - SSH Load hosts
    from: SSH Exec
    args:
      quiet: true
      cmd  : >-
         curl -X GET "https://httpbin.org/json" -H "accept: application/json"

    exec: |
      print("STDOUT   = " + stringify(jsonParse(args.stdout)));
      print("STDERR   = " + args.stderr);
      print("EXITCODE = " + args.exitcode);

todo:
  - name: SSH Load hosts
    args:
      chHosts: myhosts
      file   : hosts.yaml
  
  - name: Example Echo 123
    args:
      chHosts: myhosts

  - name: Example with multiple commands
    args:
      chHosts: myhosts

  - name: Example to parse output
    args:
      chHosts: myhosts

````

## oJobSQL

Allows for easy SQL query or executiong in any JDBC database. 

Basic example:
````yaml
consts:
  dbJDBC: &jdbcurl  jdbc:oracle:thin:@1.2.3.4:1521:ORCL
  dbUser: &jdbcuser scott
  dbPass: &jdbcpass tiger

include:
  - ojobSQL.yaml

jobs:
  ########################
  - name: Get current date
    from: SQL
    args:
      DBURL : *jdbcurl
      DBUser: *jdbcuser
      DBPass: *jdbcpass
      sql   : select current_date cd, sysdate sd from dual
    exec: |
      tprint("Current date = {{CD}}", args.output[0]);
      tprint("System date  = {{SD}}", args.output[0]);

  ##########################
  - name: Get generated data
    from: SQL RAID
    args:
      DBURL : *jdbcurl
      DBUser: *jdbcuser
      DBPass: *jdbcpass
      format : table
      sql    : |
        SELECT level, current_date, sysdate
        FROM   dual
        CONNECT BY level <= 10

todo:
  - Get current date
  - Get generated data
````

Example using RAID:

````yaml
consts:
  raidURL: &raidurl http://user:pass@1.2.3.4:1234/xdt
  raidDB : &raiddb  Dat

include:
  - ojobSQL.yaml

jobs:
  ########################
  - name: Get current date
    from: SQL RAID
    args:
      raidURL: *raidurl
      raidDB : *raiddb
      sql    : select current_date cd, sysdate sd from dual
    exec: |
      tprint("Current date = {{CD}}", args.output[0]);
      tprint("System date  = {{SD}}", args.output[0]);

  ##########################
  - name: Get generated data
    from: SQL RAID
    args:
      raidURL: *raidurl
      raidDB : *raiddb
      format : table
      sql    : |
        SELECT level, current_date, sysdate
        FROM   dual
        CONNECT BY level <= 10

todo:
  - Get current date
  - Get generated data
````

## oJobES

### Start Log to ES

Starts logging to ElasticSearch. Expects:

| Argument | Type | Description |
|----------|------|-------------|
| url | String | The ElasticSearch cluster URL |
| index | String | An ElasticSearch index name (it will be suffixed automatically with the current date) |
| format | String | The format of the date if different from day |
| host | String | A LogStash like host to identify in each entry |
| user | String | A user name |
| pass | String | A password (encrypted or not) |

Example:

````yaml
include:
  - oJobES.yaml

# [...]

# Log to ElasticSearch
todo:
  - name: Start Log to ES
    args:
      url  : http://my.es.cluster
      index: mylogs
      host : myjob
````

Example by week:

````yaml
include:
  - oJobES.yaml

# [...]

# Log to ElasticSearch
todo:
  - name: Start Log to ES
    args:
      url   : http://my.es.cluster
      index : mylogs
      format: yyyy.ww
      host  : myjob
````

### Stop ES Logging

Stops logging to ElasticSearch.

Example:
````yaml
# Stop logging to ElasticSearch
todo:
  - Stop ES logging
````

## oJobNet

_tbc_

## oJobHTTPd

Simplifies the creation of one or more HTTP(s) server where you just provide which functions to run for each URI on a http(s) server. The function will receive all the requests parameters and return the content for the browser. If you wish to return JSON please check [oJobRest](#oJobRest).

It's composed of 3 jobs:
* HTTP Start Server
* HTTP Stop Server
* HTTP Service
* HTTP File Browse

The job "HTTP Start Server" expects: 

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| port | Number | No | The port number where to assign the HTTP(s) server (defaults to 8091) |
| keystore | String | No | The keystore for the SSL certificates to create a HTTPS server | 
| pass | String | No | The password for the keystore to create a HTTPS server |
| host | String | No | The ip address of the local network interface to which to bind this HTTP server (defaults to 0.0.0.0) |
| cp | String | No | Provide a folder where the keystore file is to include it on the current classpath (Java requires for keystores to be on the execution classpath) |
| hs | HTTPServer object | No | An already created HTTPServer to which to bind the HTTP services |
| mapLibs | Boolean | No | Map internal OpenAF libs like JQuery, highlight css, etc. |

The job "HTTP Stop Server" expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| port | Number | No | The port number where to assign the HTTP(s) server (defaults to 8091) |

The job "HTTP service" expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| port | Number | No | The port number where to assign the HTTP(s) server (defaults to 8091) |
| uri | String | No | The URI where the HTTP(s) service will be available. |
| execURI | String | Yes | The code to execute whenever the uri is requested. The code is included into a function that receives the arguments: request and server. "request" is a map containing all the request properties. "server" is the HTTPServer object for which you should use replyOKText, replyOKJSON, etc. |

The job "HTTP File Browse" expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| port | Number | No | The port number where to assign the HTTP(s) server (defaults to 8091) |
| uri | String | No | The URI where the HTTP(s) service will be available. |
| path | String | Yes | The canonical path to the file path that will be made available for browsing. |
| browse | String | No | If "false" no browsing interface will be included. |

Example:
````yaml
include:
  - oJobHTTPd.yaml

ojob:
  daemon: true

jobs:
  - name: Hello world
    to  : HTTP Service
    args:
      port   : 8080
      uri    : /
      execURI: return server.replyOKText("Hello world!");

  - name: Echo
    to  : HTTP Service
    args:
      port   : 8080
      uri    : /echo
      execURI: return server.replyOKJSON(stringify(request));
 
  - name: Browser
    to  : HTTP File Browse
    args:
      port: 8080
      uri : /browser
      path: .

  - name: README
    to  : HTTP Service
    args:
      port   : 8080
      uri    : /README
      execURI: return ow.server.httpd.replyFileMD(server, ".", "/README", request.uri, void 0, [ "README.md" ]); 

todo: 

  # Starts the server
  - name: HTTP Start Server
    args:
      port   : 8080
      mapLibs: true

  # Sets a shutdown job once the everything is stopped.
  - name: HTTP Stop Server 
    args:
      port: 8080
    
  # Sets for every URI to return Hello world
  - Hello world

  # Sets that /echo will return the actual request map
  - Echo

  # Sets that /README shows this README.md file
  - README

  # Sets that /browser shows a simple browse interface for the current directory.
  - Browser
````

## oJobREST

In the same line as oJobHTTPd simplifies the specific creation of REST HTTP(s) servers.

It's composed of 3 jobs:
* REST Start Server
* REST Stop Server
* REST Service

The job "REST Start Server" expects: 

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| port | Number | No | The port number where to assign the HTTP(s) server (defaults to 8091) |
| keystore | String | No | The keystore for the SSL certificates to create a HTTPS server | 
| pass | String | No | The password for the keystore to create a HTTPS server |
| host | String | No | The ip address of the local network interface to which to bind this HTTP server (defaults to 0.0.0.0) |
| cp | String | No | Provide a folder where the keystore file is to include it on the current classpath (Java requires for keystores to be on the execution classpath) |
| hs | HTTPServer object | No | An already created HTTPServer to which to bind the HTTP services |
| mapLibs | Boolean | No | Map internal OpenAF libs like JQuery, highlight css, etc. |

The job "REST Stop Server" expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| port | Number | No | The port number where to assign the HTTP(s) server (defaults to 8091) |

The job "REST service" expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| port | Number | No | The port number where to assign the HTTP(s) server (defaults to 8091) |
| uri | String | No | The URI where the HTTP(s) service will be available. |
| execGET | String | Yes | The code to execute whenever the uri is requested with a GET verb. The code is included into a function that receives the argument: idxs. "idxs" is a map containing all the parameters from the URL. |
| execPOST | String | Yes | The code to execute whenever the uri is requested with a POST verb. The code is included into a function that receives the arguments: idxs and data. "idxs" is a map containing all the parameters from the URL. "data" is a map containing all the parameters passed on the request body. |
| execPUT | String | Yes | The code to execute whenever the uri is requested with a PUT verb. The code is included into a function that receives the arguments: idxs and data. "idxs" is a map containing all the parameters from the URL. "data" is a map containing all the parameters passed on the request body. |
| execDELETE | String | Yes | The code to execute whenever the uri is requested with a DELETE verb. The code is included into a function that receives the argument: idxs. "idxs" is a map containing all the parameters from the URL. |
| returnWithParams | Boolean | No | Changes the behaviour of the return of each exec* function to use a map to force mimetype, http code, etc. (see help ow.server.rest.reply for more details) |
| error | Boolean | No | If true and an error occurs in execGET, execPOST, execPUT or execDELETE will return a map with the exception in a map with a key __error (defaults to true) |

## oJobOPack

Simplifies the creation of oPack files based on an url or oPack name.

The job "oPack Pack external" expects: 

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| name | String | Yes | The name or URL to an oPack |
| tmpDir | String | No | The temporary folder to use during the process (defaults to ./tmp) |
| outputDir | String | No | Output folder where the oPack will be placed (defaults to .) |

Example:

````yaml
include:
  - oJobOPack.yaml

todo:
  - name: oPack Pack external
    args:
      - name  : https://raw.githubusercontent.com/OpenAF/nAttrMon/master
        tmpDir: nAttrMon

      - name  : APIs
        tmpDir: APIs

      - name  : GoogleCompiler
        tmpDir: GoogleCompiler
        
      - name  : GooglePhoneNumber
        tmpDir: GooglePhoneNumber
````

## oJobRAID

Simplified RAID AF operation execution.

Expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| raidURL | String | Yes | A RAID AF connection URL. |
| operation | String | Yes | The RAID AF operation to execute. |
| input | Map | No | The RAID AF operation input map. |
| format | String | No | If not quiet it displays the result on a format you can choose between "prettyprint" (default), "pmap", "parametermap", "yaml" or "json" |
| quiet | Boolean | No | If true no output will be displayed. |

````yaml
include:
  - oJobRAID.yaml

todo:
  - name: RAID AF
    args:
      raidURL  : http://user:pass@127.0.0.1:8090/#/web/guest/home
      operation: Ping
      input    :
        test: 123
      format   : prettyprint
````

## oJobWatchDog

Helps build a cron-based process "watchdog" for checking if a daemon process isn't running, has a "fatal" error on the log or any custom way to check the responsive of the daemon process.

Expects:

| Argument | Type | Mandatory | Description |
|----------|------|-----------|-------------|
| checks | Map | No | Map of checks to determine if the daemon process should be restarted or not. |
| checks.pid.file | String | No | If a pid file location is provided it will check if the corresponding pid is running. If not it sets to trigger a stop and start operation. |
| checks.log.folder | String | No | Folder where the log files to check are located. |
| checks.log.fileRE | String | No | Checks for files matching fileRE choosing the latest by modified date. |
| checks.log.stringRE | String | No | Array of regular expressions strings to look for. If found assumes a restart is needed. |
| checks.log.histFile | String | No | The file where to store the history of findings on the file to avoid duplicate findings. |
| checks.log.olderMin | Number | No | Checks if the latest log file (fileRE) by modified date is older than x minutes and if yes assumes it needs to be restarted. | 
| checks.custom.exec | String | No | Executes the corresponding code in a function and passes if returns true or fails assuming a restart is needed if returns false. |
| quiet | Boolean | No | If true will only produce logging if something is not right (default is true) |
| cmdToStop | String | No | If defined will execute the command on the stop event. |
| execToStop | String | No | If defined will execute the code on the stop event. |
| jobToStop | String | No | If defined will execute the job on the stop event. |
| waitAfterStop | Number | No | Number of ms to wait after stopping. |
| workDirStop | String | No | The working directory to use for the stop command. |
| timeoutStop | Number | No | Timeout waiting for cmdToStop to exit. |
| exitCodeStop | Number | No | If defined the cmdToStop exitcode must be this value. |
| cmdToStart | String | No | Command to startup on the start event (make sure it exits after starting). | 
| execToStart | String | No | If defined will execute the code on the start event. |
| jobToStart | String | No | If defined will execute the job on the start event. |
| waitAfterStart | Number | No | Number of ms to wait after starting. |
| workDirStart | String | No | The working directory to use for startup command. |
| timeoutStart | Number | No | Timeout waiting for cmdToStart to exit. |
| exitCodeStart | Number | No |  If defined the cmdToStart exitcode must be this value. |

Example:

````yaml
include:
  - oJobWatchDog.yaml

ojob:
  logToFile   :
    logToFolder          : /some/path/watchdog.logs
    HKhowLongAgoInMinutes: 11152
    setLogOff            : false
  logToConsole: false
  logJobs     : false
  unique      :
    pidFile     : /some/path/watchdog.pid
    killPrevious: false
  checkStall  :
    everySeconds    : 1
    killAfterSeconds: 60

jobs:
  - name: Watch my logya daemon
    to  : oJob WatchDog
    args:
      checks  :
        pid:
          file: /some/path/a.pid
        log   :
          folder  : /some/path/logya
          fileRE  : log-\d+-\d+-\d+.log 
          histFile: /some/path/logya/logya.json
          stringRE: OutOfMemory
        custom:
          exec: |
            print(123);
            return false;

      cmdToStart    : start ojob /some/path/a.yaml
      workDirStart  : /some/path/
      waitAfterStart: 5000

      execToStop    : |
        pidKill(io.readFileString("/some/path/a.pid"), true);

      quiet         : false

todo:
  - nAttrMon watchdog
````

---

## Shortcuts examples:

### oJobTest.yaml

```yaml
include:
- oJobTest.yaml

todo:
- (test      ): oJob::a
  ((job     )): a
- (test      ): oJob::b
  ((job     )): b
- (test      ): Script::Test
  ((func    )): |
    sleep(1500, true)
    ow.test.assert(1, 1, "Problem with assert in script test")
- (testAssert): Problem with a and b
  ((a       )): 123
  ((b       )): 124
- (testGenMD ): __
  ((file    )): results.md

jobs:
- name: a
  exec: |
    sleep(1500, true)

- name: b
  exec: |
    throw "MY error!"
```

### oJobHTTPd.yaml

```yaml
todo:
# Starts the server
- (httpdStart  ): &PORT 12345

# Setups the default answer, /healthz, /livez and /metrics
- (httpdDefault): *PORT
  ((uri       )): /
- (httpdHealthz): *PORT 
- (httpdMetrics): *PORT
  ((prefix    )): mytest

# Allows browsing of files
- (httpdFileBrowse): *PORT
  ((uri          )): /browse
  ((path         )): .

# Allows for the upload of files
- (httpdUpload): *PORT
  ((uri      )): /upload
  ((path     )): .

# Adds a custom metric
- (httpdAddMetric): global-counter
  ((fn          )): | 
    // Sets an atomic counter if one does not exist and returns a counter increment
    if (isUnDef(global.counter)) global.counter = $atomic()
    return global.counter.inc()

# /test calls the 'test' job
- (httpdService): *PORT
  ((uri       )): /test
  ((execURI   )): |
    // Shows all request components for debug
    cprint(request)
    // Returns the result of calling the job 'test' passing the request and expecting an ANSWER to be returned
    return ow.server.httpd.reply($job("test", request).ANSWER)

jobs:
# ---------------------------------
# Job test is written in shell code
- name: test
  lang: shell
  exec: |
    # Sets ANSWER in shell script
    ANSWER="Echo from the shell (a: {{params.a}})"

    # return ANSWER

# Includes the http server functionality
include:
- oJobHTTPd.yaml

# Makes sures it runs forever and oJob-common is included
ojob:
  daemon: true
  opacks:
    oJob-common
```