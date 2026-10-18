#requires -Version 5.1
# Invoke before loading System.Windows.Forms or creating any HWND.
# On high-density displays, Windows otherwise bitmap-stretches powershell.exe's DPI-unaware UI.
function Enable-DeskSomHighDpi {
  if (-not ('DeskSom.DpiSupport' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace DeskSom {
  public static class DpiSupport {
    [DllImport("user32.dll", SetLastError=true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr awareness);
    [DllImport("shcore.dll")]
    public static extern int GetProcessDpiAwareness(IntPtr process, out int awareness);
    [DllImport("user32.dll")]
    public static extern uint GetDpiForSystem();
  }
}
'@
  }
  $process=[Diagnostics.Process]::GetCurrentProcess()
  try {
    [int]$awareness=-1
    $result=[DeskSom.DpiSupport]::GetProcessDpiAwareness($process.Handle,[ref]$awareness)
    if ($result -ne 0) { throw 'Windows could not determine DeskSom process DPI awareness.' }
    if ($awareness -eq 0) {
      [void][DeskSom.DpiSupport]::SetProcessDpiAwarenessContext([IntPtr]::new(-4))
      $result=[DeskSom.DpiSupport]::GetProcessDpiAwareness($process.Handle,[ref]$awareness)
      if ($result -ne 0 -or $awareness -eq 0) {
        throw 'DeskSom could not enable sharp high-DPI rendering. Close any previously opened setup window and restart the launcher.'
      }
    }
    # Scale only pixel geometry. Native WinForms font rasterization remains sharp.
    $dpi=[double][DeskSom.DpiSupport]::GetDpiForSystem()
    if ($dpi -lt 96 -or $dpi -gt 384) { throw 'Unexpected Windows display scaling.' }
    return $dpi / 96.0
  } finally { $process.Dispose() }
}
