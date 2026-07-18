!macro customInstall
  IfFileExists "$INSTDIR\resources\shell\SchemyShell.dll" 0 shell_registration_done
  ExecWait '"$WINDIR\Sysnative\regsvr32.exe" /s "$INSTDIR\resources\shell\SchemyShell.dll"'
  shell_registration_done:
!macroend

!macro customUnInstall
  IfFileExists "$INSTDIR\resources\shell\SchemyShell.dll" 0 shell_unregistration_done
  ExecWait '"$WINDIR\Sysnative\regsvr32.exe" /u /s "$INSTDIR\resources\shell\SchemyShell.dll"'
  shell_unregistration_done:
!macroend
