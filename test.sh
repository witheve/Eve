#!/bin/bash

mode="CLI"
tests="func/**/*.js"
spookFlags=""
casperFlags=""
outDir="/tmp/test-eve"
taskDir="$outDir"

# Parse arguments without relying on getopt
while [[ $# > 0 ]]; do
  key="$1"
  case $key in
    -o|--out)
      outDir="$2"
      shift
    ;;
    --taskDir)
      taskDir="$2"
      shift
    ;;
    -t|--tests)
      tests="$2"
      shift
    ;;
    --disableCapture)
      casperFlags="$casperFlags $1"
    ;;
    -s|--save)
      spookFlags="$spookFlags --add \"$2\""
      outDir="$taskDir"
      shift
    ;;
    -l|--list)
      spookFlags="$spookFlags --list-tests"
      ;;
    --serve|--server)
      mode="server"
    ;;
    *)
      echo "Unknown argument $1"
    ;;
  esac
  shift
done

# Ensure dependencies are installed.
echo "* Checking dependencies..."
hash slimerjs 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Please install slimerjs with ('npm install -g slimerjs') before continuing."
  exit
fi
hash casperjs 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Please install casperjs with ('npm install -g casperjs@1.1.0-beta3') before continuing."
  exit
fi
hash spook 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Please install spook with ('npm install -g spook') before continuing."
  exit
fi

hash gm 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Please install GraphicsMagick with ('brew install GraphicsMagick' on mac, or from your dist's repo) before continuing."
  exit
fi

if [[ $mode == "server" ]]; then
  spook --server $spookFlags --out "$outDir" --dbd "$taskDir" -- $casperFlags
  exit
fi

echo "* Checking if runtime server is up..."
ps aux | grep [t]arget/debug/server
if [ $? -ne 0 ]; then
  echo "Please run the runtime server separately and rerun the test suite after it has fully started."
  exit
fi

echo "* Running integration tests..."
echo "- Output dir is: $outDir"

spook --out "$outDir" --base "ui/bin/test" --tests "$tests" --includes "ui/bin/test/include/**/*.js" $spookFlags -- --verbose --basePath="`pwd`" --engine=slimerjs $casperFlags