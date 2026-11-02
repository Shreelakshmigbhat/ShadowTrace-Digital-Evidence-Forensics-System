# Starts the project's portable MongoDB (port 27017, data in %USERPROFILE%\shadowtrace-mongodb\data).
# Run once after every reboot, BEFORE `npm run dev`. Skips starting if it is already running.
if (Get-Process mongod -ErrorAction SilentlyContinue) { "already running"; exit }
$dir = "$env:USERPROFILE\shadowtrace-mongodb"
$mongod = Get-ChildItem "$dir\bin" -Recurse -Filter mongod.exe | Select-Object -First 1 -ExpandProperty FullName
Start-Process -FilePath $mongod -WindowStyle Hidden -ArgumentList @("--dbpath","`"$dir\data`"","--bind_ip","127.0.0.1","--port","27017")
"started"
