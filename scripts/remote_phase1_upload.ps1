param(
  [Parameter(Mandatory=$true)][string]$HostName,
  [Parameter(Mandatory=$true)][string]$User,
  [Parameter(Mandatory=$true)][string]$RemoteDir,
  [int]$Port = 22,
  [string]$KeyFile = ""
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Bundle = Join-Path $Repo "dist\phase1_class6_server_bundle.zip"

python (Join-Path $PSScriptRoot "make_phase1_server_bundle.py")

$Target = "$User@$HostName"
$SshArgs = @("-p", "$Port")
$ScpArgs = @("-P", "$Port")
if ($KeyFile -ne "") {
  $SshArgs += @("-i", $KeyFile)
  $ScpArgs += @("-i", $KeyFile)
}

ssh @SshArgs $Target "mkdir -p '$RemoteDir'"
scp @ScpArgs $Bundle "${Target}:$RemoteDir/"
ssh @SshArgs $Target "cd '$RemoteDir' && unzip -o phase1_class6_server_bundle.zip && bash scripts/setup_phase1_server.sh && bash scripts/run_phase1_class6.sh"
