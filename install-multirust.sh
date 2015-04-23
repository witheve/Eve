#!/bin/sh

say() {
    echo "blastoff: $1"
}

verbose_say() {
    if [ "$flag_verbose" = true ]; then
	say "$1"
    fi
}

err() {
    say "$1" >&2
    exit 1
}

need_cmd() {
    if ! command -v $1 > /dev/null 2>&1
    then err "need $1"
    fi
}

need_ok() {
    if [ $? != 0 ]; then err "$1"; fi
}

assert_nz() {
    if [ -z "$1" ]; then err "assert_nz $2"; fi
}

create_tmp_dir() {
    local tmp_dir=`pwd`/multirust-tmp-install

    rm -Rf "${tmp_dir}"
    need_ok "failed to remove temporary installation directory"

    mkdir -p "${tmp_dir}"
    need_ok "failed to create create temporary installation directory"

    echo $TMP_DIR
}

run() {
    need_cmd rm
    need_cmd git
    need_cmd sed
    need_cmd sh
    need_cmd sleep

    GIT_REPO=https://github.com/brson/multirust.git
    UNINSTALL=

    for arg in "$@"; do
	case "$arg" in
	    --uninstall )
		UNINSTALL=true
		;;
	    * )
		err "unrecognized arguent '$arg'"
		;;
	esac
    done

    if [ ! -e "/dev/tty" ]; then
	err "/dev/tty does not exist"
    fi

    if [ -z "$UNINSTALL" ]; then
	cat <<EOF

This script will download, build, and install multirust as root, then
configure multirust with the most common options.  It may prompt for
your password for installation via 'sudo'.

You may run /usr/local/lib/rustlib/uninstall.sh to uninstall multirust.
EOF
    else
	echo "This script will uninstall multirust. It may prompt for your password via 'sudo'."
    fi

    echo

    tmp_dir=$(mktemp -d 2>/dev/null \
	|| mktemp -d -t 'rustup-tmp-install' 2>/dev/null \
	|| create_tmp_dir)
    if [ -z "$tmp_dir" ]; then
	err "empty temp dir"
    fi

    original_dir=`pwd`

    say "working in temporary directory $tmp_dir"
    cd "$tmp_dir"
    need_ok "failed to cd to temporary install directory"

    local _branch="${MULTIRUST_BLASTOFF_BRANCH-master}"

    # Clone git repo
    say "cloning multirust git repo"
    git clone "$GIT_REPO" -b "$_branch" --depth 1
    if [ $? != 0 ]; then
	cd "$original_dir" && rm -Rf "$tmp_dir"
	err "failed to clone git repo $GIT_REPO"
    fi
    cd multirust
    if [ $? != 0 ]; then
	cd "$original_dir" && rm -Rf "$tmp_dir"
	err "failed to cd to git repo"
    fi

    say "building"
    sh ./build.sh
    if [ $? != 0 ]; then
	cd "$original_dir" && rm -Rf "$tmp_dir"
	err "failed to build multirust"
    fi

    if [ -z "$UNINSTALL" ]; then
	say "installing"
	sudo ./install.sh
	if [ $? != 0 ]; then
	    cd "$original_dir" && rm -Rf "$tmp_dir"
	    err "failed to install multirust"
	fi
    else
	say "uninstalling"
	sudo ./install.sh --uninstall
	if [ $? != 0 ]; then
	    cd "$original_dir" && rm -Rf "$tmp_dir"
	    err "failed to uninstall multirust"
	fi
    fi

    cd "$original_dir" && rm -Rf "$tmp_dir"
    need_ok "failed to remove temporary install directory"

    if [ -n "$UNINSTALL" ]; then
	exit 0
    fi

    if ! command -v $1 > /dev/null 2>&1; then
	err "unable to run `multirust` after install. this is odd. not finishing configuration"
    fi

    say "installing nightly toolchain"
    multirust default nightly
    need_ok "failed to install nightly toolchain. if this appears to be a network problem retry with `multirust default nightly`"

    say "all systems go"
}

run "$@"
