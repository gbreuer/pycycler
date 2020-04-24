const {app, BrowserWindow} = require('electron')
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ipc = require('electron').ipcMain;

let mainWindow
let backendServer

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    webPreferences: {
      nodeIntegration: true
    }
  });

  mainWindow.webContents.on('dom-ready', createServer);

  mainWindow.setMenu(null);
  mainWindow.setResizable(false);

  mainWindow.loadFile('src/index.html')

  // Open the DevTools for debugging rendering errors.
  //mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    mainWindow = null
  });
}

//Initialize python server to handle queries in background
const createServer = () => {
  let executable = ""

  //TODO: Add OSX support
  switch (process.platform){
    case 'linux':
      executable = path.join(__dirname,'dist/cycler_wrapper_zeromq/cycler_wrapper_zeromq');
      break;

    case 'win32':
      executable = path.join(__dirname,'dist\\cycler_wrapper_zeromq\\cycler_wrapper_zeromq.exe');
      break;
  }

  //Check if python backend exists and report errors if not.
  if (fs.existsSync(executable)){
    console.log("Attempting to start python back-end at "+executable);
    console.log('"'+executable+'"');
    backendServer = spawn('"'+executable+'"', options={shell:true});

    if (backendServer != null){
      console.log("Server started: "+backendServer.pid.toString());
      backendServer.stdout.on('data', function(data){
        console.log("SERVER_MSG: "+data.toString());
      });
      backendServer.stderr.on('data', function (data) {
        console.log("SERVER_MSG: "+data.toString());
      });
    }
    else{
      console.log("ERROR: Cannot start backend server at "+executable);
        error_msg = "Proper back-end for data processing failed to start. Visit <a href='https://github.com/gbreuer/cycler'>our repository</a> for help.";
        mainWindow.webContents.send('mainjs-error', error_msg);
        console.error(error_msg);
    }
  }
  else {
    error_msg = "Proper back-end for data processing not found. Please build or download appropriate binary \
    for your operating system and try again. Visit <a href='https://github.com/gbreuer/cycler'>our repository</a> for help.";
    mainWindow.webContents.send('mainjs-error', error_msg);
    console.error(error_msg);
  }
}

app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow()
})
