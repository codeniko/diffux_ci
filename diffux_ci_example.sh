#!/bin/bash -ex

# This is an example script that generates and uploads Diffux-CI diffs for the
# differences between the previous and current commit.

run-diffux-ci() {
  # Checkout the commit
  git checkout --quiet $1

  # Install dependencies and precompile the JavaScript bundle
  npm install
  webpack ./entry.js bundle.js

  # Run diffux for the current commit. We use `xvfb-run` so that we can run
  # diffux (which uses Firefox) in a headless display environment.
  xvfb-run diffux
}

# Check out the previous version and generate baseline snapshots
run-diffux-ci HEAD^

# Check out the latest version and check for diffs
run-diffux-ci -

# Finally, upload any diffs to s3
url_to_diffs=`diffux upload_diffs`
if [ -n "$url_to_diffs" ]; then
  # We have a URL to the diff(s) found for the commit. We can choose to do one
  # of a few things here. We either exit the script with a non-zero exit code.
  # This will likely make the CI run fail. We can also allow the script to pass,
  # but instead post a comment to the commit with the URL to the diff(s). Below
  # is an example of the latter, where we post back a comment to a Gerrit patch
  # set.
  message="Diffux-CI diff(s) were found: $link_to_diffs"

  ssh -p 29418 jenkins@example.com \
    gerrit review \'--message="$message"\' $GERRIT_PATCHSET_REVISION
fi

