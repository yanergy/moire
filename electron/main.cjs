const { app, BrowserWindow } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
    })

    if (isDev) {
        win.loadURL('http://localhost:5173')
        win.webContents.openDevTools()
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'))
    }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})
