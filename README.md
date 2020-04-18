# Cycler automated cell cycle profiling application

**Analyze multiple cell-cycle experiments at once.**

This application is powered by [Node.js](https://nodejs.org/en/download/) and [Electron.js](https://electronjs.org/) interactions with a Python back-end for leveraging high-efficiency data processing libraries.

This application is comprised of the following files:

- `package.json` - Points to the app's main file and lists its details and dependencies.
- `main.js` - Starts the app and creates a browser window to render HTML. This is the app's **main process**.
- `index.html` - A web page to render. This is the app's **renderer process**.

The structure of this application is based heavily on the sample Electron.js application found in the [Electron.js Quick Start Guide](https://electronjs.org/docs/tutorial/quick-start).

## To Use

Operation of the Electron.js UI requires proper function of the Python back-end. For distribution purposes, these are typically compiled using PyInstaller for the appropriate platform and placing the resulting executable inside the `dist` folder in the root directory of the application.

## License

License information can be found [here](LICENSE.md)
