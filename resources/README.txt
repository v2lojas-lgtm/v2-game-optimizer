Build resources for electron-builder.

Place the following files here before packaging:

  icon.ico   — App icon for Windows installer and taskbar (256x256, ICO format)
               If missing, electron-builder uses the default Electron icon.

To convert the PNG logo to ICO, use an online tool (e.g. convertio.co)
or ImageMagick: magick src/renderer/src/assets/lgo.png.png -resize 256x256 resources/icon.ico
