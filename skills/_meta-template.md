---
# A META skill bundles other skills. Remove the leading underscore to publish.
# Installing this skill installs every skill listed in `dependencies` too
# (resolved recursively and deduped by the CLI).
id: my-bundle
name: My Bundle
description: A meta skill that installs a curated set of related skills together.
category: Developer Tools
tags: [bundle, meta]
type: meta
dependencies:
  - "@yourhandle/skill-one"
  - "@yourhandle/skill-two"
purpose: Set up everything needed for <workflow> in one install.
instructions:
  - Apply each dependency skill in order.
  - Coordinate their outputs toward the overall goal.
---

# My Bundle

This meta skill exists to install and orchestrate its dependencies. Describe how
the bundled skills work together and when someone should install the bundle
instead of the individual skills.

## Instructions

1. Install resolves `@yourhandle/skill-one` and `@yourhandle/skill-two` first.
2. Use them together to accomplish the end-to-end workflow.
