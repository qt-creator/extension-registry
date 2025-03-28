# The Registry

[![Number of Extensions](./badges/extensions.svg)](./badges/extensions.svg)
[![Status of CI validation](https://github.com/qt-creator/extension-registry/actions/workflows/validate.yml/badge.svg)](https://github.com/Maddimax/registry/actions/workflows/validate.yml)

This contains a registry of extensions.

## How to include your plugin

1. Fork this repository
2. Add a new folder in the `registry` folder with the name `<vendorid>.<pluginid>`
3. Add your extension to the registry using `node scripts/new.js registry/<vendorid>.<pluginid> <path/to/your/extension.json>`. This will create a new folder with the name `<vendorid>.<pluginid>` and create the `extension.json` based on your extension in it. (You can also specify your lua entry script path instead)
4. Run `npm run all` to validate your changes
5. Run `git add .` and `git commit -m "Added <your-plugin-id>"`
6. Push your changes to your fork
7. Create a pull request to this repository
8. Wait for approval

## Fixing / setting SHA keys

To ease adding new versions of plugins, you can run the script
`node scripts/fixhashes.js <path/to/your/extension.json>`.
This will calculate the sha256 hash of the sources and update the
`sha256` key in the `sources` object.

## Distribution

This repo contains a `.gitattributes` file that excludes folders from
a call to `git archive`. This is used to create a zip file of the registry
for distribution. The following command will create a zip file of the registry
without the unecessary folders:

```bash
git archive --format=zip HEAD -o registry.zip
```

Conveniently, GitHubs "Download ZIP" feature honors the `.gitattributes` file
and will create a zip file of the registry without the unecessary folders.
