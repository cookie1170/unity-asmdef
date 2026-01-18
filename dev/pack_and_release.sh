#!/usr/bin/env bash

rm out/*.vsix
vsce pack -o out

ver=$(jq '.version' \
      --raw-output \
      -- < package.json)

tag="v$ver"
echo $tag

git tag -a $tag
git push --follow-tags

gh release create $tag --notes-from-tag --fail-on-no-commits ./out/*.vsix