#!/usr/bin/env bash

waitUrl="$(pwd)/ui/waiting-room.html"
rustVersion="nightly-2015-08-10"
tscVersion="1.6.0-dev.20150731"
tscBin="$(pwd)/ui/node_modules/typescript/bin/tsc"
mode="run"
debugFlag=false
noBrowserFlag=false

# Parse command line options.
while test $# -gt 0; do
  case "$1" in
    -h|--help)
      echo "Compile and run the Eve editor"
      echo ""
      echo "Usage:"
      echo "    run.sh [command = run] [options]"
      echo ""
      echo "Commands:"
      echo "    run        (Default) Build and run eve"
      echo "    build      Build editor and runtime server"
      echo "    test       Execute the eve test suite"
      echo ""
      echo "Options:"
      echo "    -h, --help          Print this message"
      echo "    -d, --debug         Debug build"
      echo "    -n, --no-browser    Do not open editor in browser"
      exit 0
      ;;
    run|build|test)
      mode="$1"
      ;;
    -d|--debug)
      debugFlag=true
      ;;
    -n|--no-browser)
      noBrowserFlag=true
      ;;
    *)
      echo "Unkown option $1"
      ;;
  esac
  shift
done



if [[ "$mode" == "test" ]]; then
  ./test.sh
  exit $?
fi



# Ensure that dependencies are installed.
deps="npm multirust $tscBin"
function installCommand {
  msg=""
  case "$1" in
    "$tscBin")
      cd ./ui
      out=$(npm install)
      $res=$?
      cd ..
      return $out
      ;;
    multirust)
      msg="./install-multirust.sh"
      ;;
    *)
      msg="Please consult the internet for instructions on installing this on your distribution."
      ;;
  esac
  printf "\n  x Please install $1:\n"
  echo "    $msg"
  exit 1
}

printf "* Checking dependencies..."
for dep in $deps; do
  if ! which "$dep" &> /dev/null; then
    installCommand $dep
  fi
done

# Check tsc version
version=$($tscBin --version)
if [[ "$version" != *"Version $tscVersion"* ]]; then
  echo ""
  echo "  x Eve requires tsc version \"$tscVersion\" but \"$version\" is installed. Please reinstall using:"
  echo "    cd ui && npm install && cd .. before continuing."
  exit 1
fi

echo "done."

# Try using the TypeScript compiler (tsc) to compile UI.
printf "* Compiling editor..."
pushd . &> /dev/null
  cd "ui";
  tscError=$($tscBin)
  if [ $? -ne 0 ]; then
    printf "\n  x %s\n" "$tscError"
    popd &> /dev/null
    exit 1
  else
    echo "done."
  fi
popd &> /dev/null

# If noBrowserFlag is false open the editor in the user's preferred browser.
if ! $noBrowserFlag && [[ $mode == "run" ]]; then
  echo "* Opening editor: $waitUrl"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$waitUrl" &> /dev/null
  else
    xdg-open "$waitUrl" &> /dev/null
  fi
fi

pushd . &> /dev/null
  cd runtime

  # Ensure Rust is updated.
  multirust list-toolchains | grep "$rustVersion" &> /dev/null
  if [ $? -eq 0 ]; then
    echo "* Rust is up to date."
    multirust override "$rustVersion" &> /dev/null
  else
    printf "* Updating Rust..."
    multirustOutputFile="multirust-output.log"
    multirust override "$rustVersion" &> "$multirustOutputFile"
    if [ $? -ne 0 ]; then
      cat "$multirustOutputFile"
      rm "$multirustOutputFile"
      exit 1
    else
      echo "done."
    fi
  fi

  if [[ "$mode" == "build" ]]; then
    exit 0
  fi

  # Compile and run server.
  echo "* Compiling and running server. This takes a while..."
  rustFlags="--release"
  if $debugFlag; then
    rustFlags=""
  fi

  RUST_BACKTRACE=1 cargo run --bin=server $rustFlags
popd &> /dev/null
