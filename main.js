// Modules to control application life and create native browser window
const {app, BrowserWindow} = require('electron')
const path = require('path');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow
let backendServer

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true
    }
  })

 mainWindow.setMenu(null)

  // and load the index.html of the app.
  mainWindow.loadFile('src/index.html')

  // Open the DevTools.
  mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

//Initialize python server to handle queries in background
const createServer = () => {
  let executable = ""

  switch (process.platform){
    case 'linux':
      executable = './dist/cycler_wrapper_zeromq';
      break;

    case 'win32':
      executable = './dist/cycler_wrapper.zeromq.exe'
      break;
  }

  let backendServer = require('child_process').spawn(executable)
  if (backendServer != null){
    console.log("Server started.");
  }
  else{
    console.log("ERROR: Cannot start backend server at "+executable)
  }
}

const killServer = () => {
  backendServer.kill();
  backendServer = null;
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)
app.on('ready', createServer)

app.on('will-quit', killServer);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
