---
# Remove the leading underscore from the filename to publish this skill.
# The file name (or this id) becomes the skill id, scoped to your handle.
id: my-skill-id
name: My Skill Name
description: One sentence describing what this skill does and when to use it.
category: Utilities          # Conversational, Data, Automation, Utilities, Developer Tools, Productivity, Research, Sales, Support, Education, Finance, Legal, Security, Healthcare, Compliance
tags: [example, template]
type: basic                  # basic (standalone) or meta (bundles other skills). A skill with dependencies is automatically meta.
dependencies: []             # for meta skills: full ids of required skills, e.g. [@author/skill-a, @author/skill-b]. Installing this skill installs them too.
purpose: The outcome this skill is meant to achieve.
instructions:
  - First thing the model should do.
  - Second thing the model should do.
  - Constraints or formatting rules to follow.
---

# My Skill Name

Write the skill's guidance here in plain markdown. This body is published as the
skill content and is also used as the prompt template if you don't set one in
front-matter.

## Instructions

1. Describe step one.
2. Describe step two.
3. Describe any constraints.

## Notes

Anything else useful to whoever installs this skill.
