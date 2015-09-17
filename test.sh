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
printf "* Checking dependencies..."
hash slimerjs 2>/dev/null
if [ $? -ne 0 ]; then
  printf "X\n  Please install slimerjs with ('npm install -g slimerjs') before continuing.\n"
  exit 1
fi
hash casperjs 2>/dev/null
if [ $? -ne 0 ]; then
  printf "X\n  Please install casperjs with ('npm install -g casperjs@1.1.0-beta3') before continuing.\n"
  exit 1
fi
hash spook 2>/dev/null
if [ $? -ne 0 ]; then
  printf "X\n  Please install spook with ('npm install -g spook') before continuing.\n"
  exit 1
fi

hash gm 2>/dev/null
if [ $? -ne 0 ]; then
  printf "X\n  Please install GraphicsMagick with ('brew install GraphicsMagick' on mac, or from your dist's repo) before continuing.\n"
  exit 1
fi
echo "done."

if [[ $mode == "server" ]]; then
  result="$(spook --server $spookFlags --out "$outDir" --dbd "$taskDir" -- $casperFlags)"
  exit $result
fi

printf "* Checking if runtime server is up..."
ps aux | grep -q '[t]arget/\(debug\|release\)/server'
res="$?"
if [ "$res" -ne 0 ]; then
  printf "X\n  Please run the runtime server separately and rerun the test suite after it has fully started.\n"
  exit 2
fi
echo "done."

echo "* Running integration tests..."
echo "- Output dir is: $outDir"

spook --error-on-fail --out "$outDir" --base "ui/bin/test" --tests "$tests" --includes "ui/bin/test/include/**/*.js" $spookFlags -- --verbose --basePath="`pwd`" --engine=slimerjs $casperFlags
exit $?