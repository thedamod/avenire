param(
  [string]$Python = 'python',
  [string]$Evidence = (Join-Path $env:TEMP 'avenire-qt-evidence'),
  [switch]$ProtocolOnly
)
$ErrorActionPreference = 'Stop'
$names = @('QT_QPA_PLATFORM', 'QT_QUICK_BACKEND', 'PYTHONIOENCODING', 'AVENIRE_QT_VISUAL_E2E', 'AVENIRE_QT_EVIDENCE')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$code = 0
Push-Location (Resolve-Path (Join-Path $PSScriptRoot '..\..\..'))
try {
  $env:PYTHONIOENCODING = 'utf-8'
  $env:QT_QPA_PLATFORM = 'offscreen'
  $env:QT_QUICK_BACKEND = 'software'
  & $Python -m unittest discover -s apps/desktop-native/tests -p test_engine.py -v
  $code = $LASTEXITCODE
  if ($code -eq 0 -and -not $ProtocolOnly) {
    $env:QT_QPA_PLATFORM = 'windows'
    Remove-Item Env:QT_QUICK_BACKEND -ErrorAction SilentlyContinue
    $env:AVENIRE_QT_VISUAL_E2E = '1'
    $env:AVENIRE_QT_EVIDENCE = $Evidence
    & $Python -m unittest discover -s apps/desktop-native/tests -p test_visual_e2e.py -v
    $code = $LASTEXITCODE
  }
} finally {
  Pop-Location
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
exit $code
