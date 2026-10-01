param([ValidateSet('encrypt','decrypt')][string]$Mode)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$taskBytes = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
if ($Mode -eq 'encrypt') {
  $taskResult = [Security.Cryptography.ProtectedData]::Protect($taskBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
} else {
  $taskResult = [Security.Cryptography.ProtectedData]::Unprotect($taskBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
}
[Console]::Out.Write([Convert]::ToBase64String($taskResult))
