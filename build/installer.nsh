!include LogicLib.nsh

!ifdef BUILD_UNINSTALLER
  !define WSR_FUNCTION_PREFIX "un."
!else
  !define WSR_FUNCTION_PREFIX ""
!endif

Function ${WSR_FUNCTION_PREFIX}WSRCloseRunningApp
  Exch $R8
  Push $R0
  Push $R1
  InitPluginsDir
  File /oname=$PLUGINSDIR\wsr-close-running-app.ps1 "${BUILD_RESOURCES_DIR}\close-running-app.ps1"

  wsr_check:
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\wsr-close-running-app.ps1" -AppPath "$R8" -CheckOnly'
    Pop $R0
    Pop $R1
    StrCmp $R0 "0" wsr_done
    StrCmp $R0 "10" 0 wsr_failed
    IfSilent wsr_request_close
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "WinScreen Recorder está abierto. Se solicitará su cierre para continuar. Las grabaciones pendientes se conservarán para recuperar después." IDOK wsr_request_close IDCANCEL wsr_cancel

  wsr_request_close:
    DetailPrint "Cerrando WinScreen Recorder y conservando las grabaciones pendientes…"
    nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\wsr-close-running-app.ps1" -AppPath "$R8" -WaitSeconds 45'
    Pop $R0
    Pop $R1
    StrCmp $R0 "0" wsr_done
    IfSilent wsr_cancel
    StrCmp $R0 "20" 0 wsr_failed
    MessageBox MB_RETRYCANCEL|MB_ICONINFORMATION "Esta versión anterior no admite el cierre automático. Elige Salir en el icono de WinScreen Recorder de la bandeja de Windows y después pulsa Reintentar. Si hay una captura pendiente, selecciona Conservar y salir." IDRETRY wsr_check IDCANCEL wsr_cancel

  wsr_failed:
    IfSilent wsr_cancel
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "No se pudo confirmar que WinScreen Recorder esté cerrado. Elige Salir desde su icono en la bandeja y pulsa Reintentar. La instalación no forzará el cierre ni reemplazará archivos en uso." IDRETRY wsr_check IDCANCEL wsr_cancel

  wsr_cancel:
    SetErrorLevel 1602
    Quit

  wsr_done:
    Pop $R1
    Pop $R0
    Pop $R8
FunctionEnd

!macro customCheckAppRunning
  Push "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  Call ${WSR_FUNCTION_PREFIX}WSRCloseRunningApp
  Push $R9
  ReadRegStr $R9 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $R9 != ""
  ${AndIf} $R9 != $INSTDIR
    Push "$R9\${APP_EXECUTABLE_FILENAME}"
    Call ${WSR_FUNCTION_PREFIX}WSRCloseRunningApp
  ${EndIf}
  ${If} $installMode == "all"
    ReadRegStr $R9 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $R9 != ""
    ${AndIf} $R9 != $INSTDIR
      Push "$R9\${APP_EXECUTABLE_FILENAME}"
      Call ${WSR_FUNCTION_PREFIX}WSRCloseRunningApp
    ${EndIf}
  ${EndIf}
  Pop $R9
!macroend
