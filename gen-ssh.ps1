$sshDir = "$env:USERPROFILE\.ssh"
if (!(Test-Path $sshDir)) {
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
}
$keyFile = "$sshDir\id_ed25519"
if (!(Test-Path "$keyFile.pub")) {
    ssh-keygen -t ed25519 -C "panelium-server" -f $keyFile -N ""
}
Get-Content "$keyFile.pub"
