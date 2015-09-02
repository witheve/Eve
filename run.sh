#!/usr/bin/env bash

waitUrl="$(pwd)/ui/waiting-room.html"
rustVersion="nightly-2015-08-10"
tscVersion="1.6.0-dev.20150731"
tscBin="`pwd`/ui/node_modules/typescript/bin/tsc"
debugFlag=false
noBrowserFlag=false

# Parse command line options.
while test $# -gt 0; do
case "$1" in
  -h|--help)
    echo "Compile and run the Eve editor"
    echo ""
    echo "Usage:"
    echo "    run.sh [options]"
    echo ""
    echo "Options:"
    echo "    -h, --help          Print this message"
    echo "    -d, --debug         Debug build"
    echo "    -n, --no-browser    Do not open editor in browser"
    exit 0
    ;;
  -d|--debug)
    debugFlag=true
    shift
    ;;
  -n|--no-browser)
    noBrowserFlag=true
    shift
    ;;
  *)
    break
    ;;
esac
done

# Ensure that dependencies are installed.
printf "* Checking dependencies..."
deps="multirust $tscBin"
for dep in $deps; do
  if ! which "$dep" &> /dev/null; then
    printf "\n  x Please install $dep:\n"
    if [ "$dep" = "$tscBin" ]; then
      echo "    cd ui && npm install && cd .."
    elif [ "$dep" = "multirust" ]; then
      echo "    ./install-multirust"
    fi
    exit 1
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
if ! $noBrowserFlag; then
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

  # Compile and run server.
  echo "* Compiling and running server. This takes a while..."
  rustFlags="--release"
  if $debugFlag; then
    rustFlags=""
  fi

  RUST_BACKTRACE=1 cargo run --bin=server $rustFlags
popd &> /dev/null
