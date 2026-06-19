!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r /REBOOTOK "$APPDATA\PiApp"
  ${endIf}
!macroend
