#!/usr/bin/env node

// =============== Imports ===============
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const inquirer = require('inquirer')

const processesFileLocation = path.join(__dirname, 'processes.json')
if (!fs.existsSync(processesFileLocation)) {
  fs.writeFileSync(processesFileLocation, '{"forwards": []}')
}

// =============== Fetching running port forwardings ===============

/**
 * Importing the saved state
 * @type {{pid: number, hostPort: number, remoteIp: string, remotePort: number}[]}
 */
const forwards = require(processesFileLocation).forwards

// =============== Displaying the action menu ===============

// The menu actions
const actionChoice = [
  'Add a port forwarding',
  'Remove a port forwarding'
]

// First menu on command start
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
      case 0: // Adding a port forwarding
        askAddForwarding()
        break
      case 1: // Deleting a port forwarding
        askRemoveForwarding()
        break

      default:
        console.log('error')
        break
    }
  })

// =============== Asking user for actions parameters ===============

/**
 * Asks user for parameters (host port > target IP > target port)
 */
function askAddForwarding () {
  inquirer
    .prompt([
      {
        type: 'input',
        name: 'hostPort',
        message: 'Host port?',
        validate: (hostPort) => validatePort(hostPort)
      },
      {
        type: 'input',
        name: 'remoteIp',
        message: 'remote IP?'
      },
      {
        type: 'input',
        name: 'remotePort',
        message: 'remote port?',
        validate: (remotePort) => validatePort(remotePort, false)
      }
    ]).then(addForwarding)
}

/**
 * Validates a port
 * @param {number} port The port to validate
 * @param {boolean?} [checkAvailability=true] Check port availability on current host (default true)
 * @returns {Promise<String|true>} Returns 'true' is the port is valid or an error message if the port is invalid
 */
async function validatePort (port, checkAvailability = true) {
  // Checking validity
  if (port < 1 || port > 65535 || parseInt(port).toString() !== port) {
    // If port is not in valid range or is not a number
    return Promise.resolve('Enter a valid port\n')
  }

  // Checking availability
  if (checkAvailability) {
    const processUsingPort = await getProcessUsingPorts(port)
    if (processUsingPort) {
      // If there already is a process using that port
      return Promise.resolve(`There already is a program using this port: ${processUsingPort}`)
    }
  }

  // Valid & available port
  return Promise.resolve(true)
}

/**
 * Prints list for user to choose the forwarding to disable & delete
 */
function askRemoveForwarding () {
  inquirer
    .prompt([
      {
        type: 'list',
        name: 'pidToTerminate',
        message: 'Which forward to terminate?',
        choices: [
          { name: 'Cancel and exit', value: -1 },
          ...forwards.map(({ pid, hostPort, remoteIp, remotePort }) => ({ name: `[${pid}] ${hostPort} => ${remoteIp}:${remotePort}`, value: pid }))
        ]
      }
    ]).then(({ pidToTerminate }) => {
      if (pidToTerminate === -1) { // Canceling
        process.exit()
      }

      // Removing selected forwarding
      removeForwarding(pidToTerminate)
    })
}

// =============== The actions ===============

/**
 * Creating the port forwarding
 * Wait 100ms for any error to appear, otherwise saves the current state
 * @param {Object} parameters the parameters for setting up the forwarding
 * @param {number} parameters.hostPort The host's port open to the internet
 * @param {string} parameters.remoteIp The target server's IP
 * @param {number} parameters.remotePort The target server's port
 */
function addForwarding ({ hostPort, remoteIp, remotePort }) {
  const newProcess = spawn('ssh', ['-L', `${hostPort}:${remoteIp}:${remotePort}`, '-N', remoteIp, '-N', '-o', 'GatewayPorts=yes'], { detached: true })
  let failed = false

  // Waiting 100 for any error to happen
  setTimeout(() => {
    if (!failed) { // If no error happened
      // Add new process to state
      forwards.push({
        pid: newProcess.pid,
        hostPort,
        remoteIp,
        remotePort
      })

      // Save state
      saveProcesses()

      // Quit program
      process.exit()
    }
  }, 100)

  // Listening for standard error stream
  newProcess.stderr.on('data', (data) => {
    failed = true
    console.error(`[Error]: ${data}`)
  })
}

/**
 * Stopping a port forwarding
 * Saves the state after terminating process
 * @param {number} pidToTerminate pid of the program to kill
 */
function removeForwarding (pidToTerminate) {
  try {
    // Killing ssh tunnel
    process.kill(pidToTerminate)
    console.log('Successfully terminated forwarding')
  } catch (error) {
    // Failed to kill process
    switch (error.errno) {
      case 'ESRCH': // Could not find process
        console.log('Error, could not find process with pid ' + pidToTerminate)
        break
      default:
        console.log('Error: ' + error.errno)
        break
    }
  } finally {
    // Removing process from saved state
    const forwardIndex = forwards.findIndex(forward => forward.pid === pidToTerminate)
    forwards.splice(forwardIndex, 1)

    // Saving state
    saveProcesses()

    // Stopping the program
    process.exit()
  }
}

/**
 * Returns the "PID/Program name" of the process listening on 0.0.0.0 (tcp only), and using the given port, or 'null' if none found
 * @param {number} port
 * @returns {Promise<string|null>}
 */
function getProcessUsingPorts (port) {
  // netstat -ntlp
  const netstatProc = spawn('netstat', ['-ntlp'])
  const regex = new RegExp(`0.0.0.0:${port}.*\\s(\\S+)`)
  return new Promise((resolve) => {
    netstatProc.stdout.on('data', (data) => {
      // Finding first process listening on given port
      const processUsingPort = data.toString().split('\n').find(line => line.match(regex))
      if (processUsingPort) {
        // Returning process "PID/Program name" if found
        resolve(processUsingPort[1])
      } else {
        // Returning null if no process found
        resolve(null)
      }
    })
  })
}

/**
 * Saves the port forwardings list to the processes.json file
 */
function saveProcesses () {
  fs.writeFileSync(processesFileLocation, JSON.stringify({ forwards }))
}
