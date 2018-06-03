# oJob-common
A set of base oJobs as common building blocks for custom oJobs.

Check the documentation for each:

| oJob-common | Description |
| ----------- | ----------- |
| [oJobBasics](#ojobbasics) | Basic init/done logging, sh command execution, etc. |
| [oJobSSH](#ojobssh) | SSH to execute commands and upload/download files. |
| [oJobSQL](#ojobsql) | Query or execute SQL to a JDBC database. |
| [oJobES](#ojobes) | Logging to ElasticSearch |
| [oJobNet](#ojobnet) | Testing network connectivity | 
| [oJobHTTPd](#ojobhttpd) | Building a simple HTTP(s) server |
| [oJobRest](#ojobrest) | Building a simple REST server |
| [oJobOPack](#ojobopack) | Simplified OPack creation |

## oJobBasics

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

## oJobSSH

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
      quiet : true
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

## oJobHTTPd

Simplifies the creation of one or more HTTP(s) server where you just provide which functions to run for each URI on a http(s) server. The function will receive all the requests parameters and return the content for the browser. If you wish to return JSON please check [oJobRest](#oJobRest).

It's composed of 3 jobs:
* HTTP Start Server
* HTTP Stop Server
* HTTP Service

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
````