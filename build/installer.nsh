!macro customInit
  IfFileExists "$INSTDIR\resources\shell\SchemyPreviewBroker.exe" 0 broker_shutdown_before_install_done
  ExecWait '"$INSTDIR\resources\shell\SchemyPreviewBroker.exe" --shutdown'
  broker_shutdown_before_install_done:
!macroend

!macro customInstall
  IfFileExists "$INSTDIR\resources\shell\SchemyShell.dll" 0 shell_registration_done
  ExecWait '"$WINDIR\Sysnative\regsvr32.exe" /s "$INSTDIR\resources\shell\SchemyShell.dll"'
  shell_registration_done:
  IfFileExists "$INSTDIR\resources\shell\SchemyPreviewBroker.exe" 0 broker_start_done
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Schemy Preview Broker" '"$INSTDIR\resources\shell\SchemyPreviewBroker.exe"'
  Exec '"$INSTDIR\resources\shell\SchemyPreviewBroker.exe"'
  broker_start_done:
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Schemy Preview Broker"
  IfFileExists "$INSTDIR\resources\shell\SchemyPreviewBroker.exe" 0 broker_shutdown_done
  ExecWait '"$INSTDIR\resources\shell\SchemyPreviewBroker.exe" --shutdown'
  broker_shutdown_done:
  IfFileExists "$INSTDIR\resources\shell\SchemyShell.dll" 0 shell_unregistration_done
  ExecWait '"$WINDIR\Sysnative\regsvr32.exe" /u /s "$INSTDIR\resources\shell\SchemyShell.dll"'
  shell_unregistration_done:
!macroend
