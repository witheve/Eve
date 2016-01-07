#!/usr/bin/env bash

# constants
bundleMap="bundle.js.map"

cyan="\033[1;36m"
purple="\033[1;35m"
blue="\033[1;34m"
yellow="\033[1;33m"
green="\033[1;32m"
red="\033[1;31m"
reset="\033[0m"

shopt -s expand_aliases
alias unit_test="mocha bin/test/unit/ --recursive --inline-diffs"

# parameters
server=false
noTest=true # Disabled due to buggy reporter

while test $# -gt 0; do
  case "$1" in
    -h|--help)
      echo "Compile and run Eve."
      echo ""
      echo "Usage:"
      echo "    run.sh [command] [options]"
      echo ""
      echo "Commands:"
      echo "    test        Run the test suite"
      echo ""
      echo "Options:"
      echo "    -h, --help        Print this message"
      echo "    -s, --server      Run Eve in networked mode"
      exit 0
      ;;
    test)
      unit_test $@
      exit $?
      ;;
    -s|--server)
      server=true
      ;;
    --no-test)
      noTest=true
      ;;
  esac
  shift
done

trap 'printf "\n# Killing all jobs and exiting.\n" && kill $(jobs -p)' EXIT

function tag {
  while read line; do
    state=""
    if [[ "$line" =~ "warning" ]] || [[ "$line" =~ "Warning" ]] || [[ "$line" =~ "WARNING" ]]; then
      state=$yellow
    elif [[ "$line" =~ "error" ]] || [[ "$line" =~ "Error" ]] || [[ "$line" =~ "ERROR" ]]; then
      state=$red
    elif [[ "$line" =~ "debug" ]] || [[ "$line" =~ "Debug" ]] || [[ "$line" =~ "DEBUG" ]]; then
      state=$cyan
    fi

    header="$state$(date +'%T')$reset [$2$1$reset]"
    if [[ "x$line" != "x" ]]; then
      echo -e "$header $line"
    fi
  done
}

function bundle {
  node_modules/watchify/bin/cmd.js -dv $3 -p [tsify -m commonjs] "$1" -o "$2"
}

echo "# Updating node_modules..."
npm i

echo "# Symlinking vendor for node execution..."
rm bin/vendor
ln -s ../vendor bin/vendor

echo "# Starting watchers..."
mkdir -p "bin"
node_modules/tsify/node_modules/typescript/bin/tsc --watch -m commonjs 2>&1 | tag "typescript" "$blue" &
bundle "src/wiki.ts" "bin/wikiBundle.js" 2>&1 | tag "editor" "$purple" &
bundle "src/slides.ts" "bin/slidesBundle.js" 2>&1 | tag "slides" "$purple" &
bundle "test/queryParserTest.ts" "bin/queryParserTestBundle.js" 2>&1 | tag "queryParserTest" "$purple" &
bundle "test/runtimeTest.ts" "bin/runtimeTestBundle.js" 2>&1 | tag "runtimeTest" "$purple" &
bundle "test/richTextEditor.ts" "bin/richTextEditorTestBundle.js" 2>&1 | tag "richTextEditorTest" "$purple" &

if $server; then
  sleep 4s
  echo "# Starting server..."
  node bin/server.js 2>&1 | tag "server" "$green" &
fi

command -v mocha >/dev/null 2>&1
if [[ $? == 0 ]] && [[ $noTest == false ]]; then
  unit_test --reporter min --watch 2>&1 | tag "unit test" "$yellow" &
fi

wait
