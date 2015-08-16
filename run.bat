SET waitUrl="`pwd`/ui/waiting-room.html";

REM Ensure typescript compiler is present and compile UI
cd "ui"
where /q tsc
if "%ERRORLEVEL%" == 0 {
  tsc
} else {
  echo "Please install the typescript compiler (tsc) before continuing."
  pause
}
cd ".."

REM If we aren't restarting, open the editor in the user's preferred browser
if not "%1" == "--restart" {
  start "" "%waitUrl%"
}

REM Ensure rustc is updated and compile backend
cd "runtime"
where /q cargo
if "%ERRORLEVEL%" == 0 {
  RUST_BACKTRACE=1 cargo run --bin=server --release
} else {
  echo "Please install rust nightly-2015-08-10 before continuing."
  pause
}


