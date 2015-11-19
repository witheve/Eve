#!/usr/bin/env bash
trap 'printf "\n# Killing all jobs and exiting.\n" && kill $(jobs -p)' EXIT

# constants
bundleMap="bundle.js.map"

cyan="\033[1;36m"
purple="\033[1;35m"
blue="\033[1;34m"
yellow="\033[1;33m"
green="\033[1;32m"
red="\033[1;31m"
reset="\033[0m"

# parameters
server=false

while test $# -gt 0; do
  case "$1" in
    -h|--help)
      echo "Compile and run Eve."
      echo ""
      echo "Usage:"
      echo "    run.sh [options]"
      echo ""
      echo "Options:"
      echo "    -h, --help        Print this message"
      echo "    -s, --server      Run Eve in networked mode"
      exit 0
      ;;
    -s|--server)
      server=true
      ;;
  esac
  shift
done

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
    echo -e "$header $line"
  done
}

function bundle {
  node_modules/watchify/bin/cmd.js -dv -p [tsify -m commonjs] "$1" -o "$2"
}

echo "# Updating node_modules..."
npm i

if $server; then
  echo "# Starting server..."
  node bin/server.js 2>&1 | tag "server" "$purple" &
fi

echo "# Starting dev watcher..."
#tsc --watch -m commonjs 2>&1 | tag "typescript" "$blue" &
bundle "src/wiki.ts" "bin/bundle.js" 2>&1 | tag "editor" "$purple" &
bundle "src/slides.ts" "bin/slides.js" 2>&1 | tag "slides" "$purple" &
wait