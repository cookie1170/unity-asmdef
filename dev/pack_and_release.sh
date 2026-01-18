#!/usr/bin/env bash

set -e

if (( $# !=  1 )); then
	>&2 echo "Must have 1 argument: patch, minor or major"
	exit 1
fi

tag=$(npm version $1)

echo "$tag"

rm -f out/*.vsix
vsce pack -o out

git push --follow-tags

gh release create $tag --fail-on-no-commits ./out/*.vsix
