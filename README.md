# oJob-common
A set of base oJobs as common building blocks for custom oJobs.

## oJobBasics.yaml

### oJob sh

This job runs a local shell command and accepts the following arguments:

| Argument | Type | Description |
|----------|------|-------------|
| cmd | string/array | The command to execute (or an array of commands) |
| quiet | boolean | Determines if the stdout should be visible or not (default is false) |
| directory | string | Sets the working directory for the command |
| stdin | string | Provide any stdin needed |
| exitcode | number | Determines what exitcode should be consider success (default is 0) |

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

todo:
  - Example Echo 123
  - Example with multiple commands
  - Example to parse output
````

## oJobSSH.yaml

### oJob sh

Executes commands on a SSH connection. The expected arguments are:

| Argument | Type | Description |
|----------|------|-------------|
| cmd | string/array | A SSH command-line to execute or and array of it (keep in mind that this isn't bash) |
| stdin | string | An optional SSH stdin for the command-line to execute |
| chHosts | string | A channel with hosts configurations to use instead of individual config |
| host | string | The SSH host |
| port | number | The SSH port (defaults to 22) |
| login | string | The SSH login |
| pass | string | The SSH pass |
| key | string | The path to a SSH key file (optional) |
| exitcode | number | Determines what exitcode should be consider success (default is 0) |
| sudo | string | Sudo's to the corresponding user to executing the command-line |
| quiet | boolean | Determines if no output of the command(s) execution should be provided (default to false) |

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

## oJobSQL.yaml

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
      quiet  : true
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

## oJobES.yaml

### Start Log to ES

Starts logging to ElasticSearch. Expects:

| Argument | Type | Description |
|----------|------|-------------|
| url | String | The ElasticSearch cluster URL |
| index | String | An ElasticSearch index name (it will be suffixed automatically with the current date) |
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

### Stop ES Logging

Stops logging to ElasticSearch.

Example:
````yaml
# Stop logging to ElasticSearch
todo:
  - Stop ES logging
````