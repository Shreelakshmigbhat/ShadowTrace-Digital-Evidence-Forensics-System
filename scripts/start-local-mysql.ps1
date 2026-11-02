# Starts the project's private MySQL (port 3308, data in %USERPROFILE%\shadowtrace-mysql-data).
# Run it once after every reboot, BEFORE `npm run dev`. Skips starting if it is already running.
if (Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'" | Where-Object { $_.CommandLine -match 'shadowtrace-mysql-data' }) { "already running"; exit }
$data = "$env:USERPROFILE\shadowtrace-mysql-data"
Start-Process -FilePath "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" -WindowStyle Hidden -ArgumentList @("--no-defaults","--datadir=`"$data`"","--port=3308","--bind-address=127.0.0.1","--mysqlx=OFF","--log-bin-trust-function-creators=1","--socket=shadowtrace_mysql")
"started"
