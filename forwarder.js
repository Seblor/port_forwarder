#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require("path")
const fs = require("fs")
const inquirer = require('inquirer');

// const configFileLocation = path.join(__dirname, ".config")
// if (!fs.existsSync(configFileLocation)) {
//   fs.writeFileSync(configFileLocation, "")
// }

const processesFileLocation = path.join(__dirname, "processes.json")
if (!fs.existsSync(processesFileLocation)) {
  fs.writeFileSync(processesFileLocation, '{"forwards": []}')
}

// Reading previous processes files
/**
 * @type {{pid: number, hostPort: number, remoteIp: string, remotePort: number}[]}
 */
const forwards = require(processesFileLocation).forwards
// fs.readFileSync(processesFileLocation).toString().split("\n").forEach(line => {
//   const [pid, hostPort, remoteIp, remotePort] = line.split(" ")
//   forwards.push({ pid, hostPort, remoteIp, remotePort })
// })



const actionChoice = [
  'Add a port forwarding',
  'Remove a port forwarding',
  'List all ports forwardings',
]

inquirer
  .prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What do you want to do?',
      choices: actionChoice
    }
  ])
  .then(answers => {
    switch (actionChoice.indexOf(answers.action)) {
      case 0:
        askAddForwarding();
        break;
      case 1:
        askRemoveForwarding();
        break;
      case 2:
        askListForwarding();
        break;

      default:
        console.log("error");
        break;
    }
  });

// Ask parameters
function askAddForwarding() {
  inquirer
    .prompt([
      {
        type: 'number',
        name: 'hostPort',
        message: 'Host port?',
        validate: answer => answer > 0 && answer < 65535 || "Enter a valid port"
      },
      {
        type: 'input',
        name: 'remoteIp',
        message: 'remote IP?'
      },
      {
        type: 'number',
        name: 'remotePort',
        message: 'remote port?'
      }
    ]).then(addForwarding)
}
function askRemoveForwarding() {
  inquirer
    .prompt([
      {
        type: 'list',
        name: 'pidToTerminate',
        message: 'Which forward to terminate?',
        choices: forwards.map(({ pid, hostPort, remoteIp, remotePort }) => ({ name: `[${pid}] ${hostPort} => ${remoteIp}:${remotePort}`, value: pid }))
      }
    ]).then(({ pidToTerminate }) => {
      try {
        process.kill(pidToTerminate)
        console.log("Successfully terminated forwarding");
      } catch (error) {
        switch (error.errno) {
          case "ESRCH":
            console.log("Error, could not find process with pid " + pidToTerminate);
            break;
          default:
            console.log("Error: " + error.errno);
            break;
        }
      } finally {
        const forwardIndex = forwards.findIndex((forward => forward.pid === pidToTerminate))
        forwards.splice(forwardIndex, 1)
        saveProcesses()
      }
    })
}
function askListForwarding() {
}

// Operations
function addForwarding({ hostPort, remoteIp, remotePort }) {
  const newProcess = spawn("ssh", ["-L", `${hostPort}:${remoteIp}:${remotePort}`, "-N", remoteIp, "-N", "-o", "GatewayPorts=yes"], { "detached": true })
  let failed = false;
  setTimeout(() => {
    if (!failed) {
      forwards.push({
        "pid": newProcess.pid,
        hostPort,
        remoteIp,
        remotePort
      })
      saveProcesses()
    }
  }, 100)

  newProcess.stderr.on('data', (data) => {
    failed = true;
    console.error(`[Error]: ${data}`);
  });
}
function removeForwarding() {

}
function listForwarding() {

}


function saveProcesses() {
  fs.writeFileSync(processesFileLocation, JSON.stringify({ forwards }))
}