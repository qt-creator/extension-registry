const Ajv = require("ajv/")
const path = require("path")
const fs = require("fs")
const fsp = require("fs/promises")
const styleTextOrg = require('node:util').styleText
const probe = require('probe-image-size');

function styleText(color, text) {
    // Github actions don't have a real tty, so styleText will normally output monochrome text.
    // But we check if the "CI" env variable is set to "true" and if so, we disable the stream validation.
    return styleTextOrg(color, text, { validateStream: process.env.CI !== "true" })
}

const rootFolder = path.join(__dirname, "..")

const extensionSchema = require(path.join(rootFolder, "schema", "extension.schema.json"))
const packSchema = require(path.join(rootFolder, "schema", "pack.schema.json"))

const baseSchema = require(path.join(rootFolder, "schema", "base.schema.ref.json"))
const sourceSchema = require(path.join(rootFolder, "schema", "source.schema.ref.json"))
const versionSchema = require(path.join(rootFolder, "schema", "version.schema.ref.json"))
const pluginMetaDataSchema = require(path.join(rootFolder, "schema", "plugin-meta-data.schema.ref.json"))

const ajv = new Ajv({ allowUnionTypes: true })
ajv.addSchema(baseSchema)
ajv.addSchema(sourceSchema)
ajv.addSchema(versionSchema)
ajv.addSchema(pluginMetaDataSchema)

const validateExtension = ajv.compile(extensionSchema)
const validatePack = ajv.compile(packSchema)

const registryFolder = path.join(rootFolder, "registry")

async function checkDirectoryContents(directory) {
    console.log(`Checking ${styleText('green', path.relative(rootFolder, directory))}`)
    const allowedFiles = ["extension.json", "pack.json", "icon.png", "icon@2x.png"]

    const files = await fsp.readdir(directory)
    if (!files.includes("extension.json") && !files.includes("pack.json")) {
        console.error(`No extension or pack found in ${styleText('red', path.relative(rootFolder, directory))}`)
        process.exit(1)
    }

    for (const file of files) {
        if (!allowedFiles.includes(file)) {
            console.error(`Unexpected file found in ${styleText('green', path.relative(rootFolder, directory))}: ${styleText('red', file)}`)
            console.log('Allowed files:', allowedFiles)
            process.exit(1)
        }
    }
}

async function checkFileSize(file, maxSize) {
    const fileSize = (await fsp.stat(file)).size
    if (fileSize > maxSize) {
        console.error(`File ${styleText("green", path.relative(rootFolder, file))} is too large: ${styleText("red", `${fileSize} bytes`)}`)
        process.exit(1)
    }
}

async function checkImageSize(image, expectedSize) {
    const iconInfo = await probe(fs.createReadStream(image));
    if (iconInfo.mime !== 'image/png' || iconInfo.type !== 'png') {
        console.error(`Icon ${styleText("green", path.relative(rootFolder, icon))} is not a PNG file`)
        process.exit(1)
    }

    if (iconInfo.width !== expectedSize || iconInfo.height !== expectedSize) {
        console.error(`Icon ${styleText("green", path.relative(rootFolder, image))} has the wrong size: ${styleText("red", `${iconInfo.width}x${iconInfo.height}`)}`)
        process.exit(1)
    }
}

async function checkIcon(icon, expectedSize) {
    await Promise.all([
        checkFileSize(icon, 100 * 1024),
        checkImageSize(icon, expectedSize)
    ])
}

async function checkIcons(directory) {
    const files = await fsp.readdir(directory)
    const icons = files.filter((file) => file === "icon.png" || file === "icon@2x.png")
    if (icons.length === 0) {
        return
    }
    if (icons.length === 1) {
        console.error(`Only one icon found in ${styleText("green", path.relative(rootFolder, directory))}`)
        process.exit(1)
    }

    await Promise.all([
        checkIcon(path.join(directory, "icon.png"), 16),
        checkIcon(path.join(directory, "icon@2x.png"), 32)
    ])
}

async function checkJsons(directory) {
    try {
        const extensionData = JSON.parse(await fsp.readFile(path.join(directory, "extension.json")))
        validateExtensionData(extensionData)
        validate(validateExtension, extensionData, path.join(directory, "extension.json"))
    } catch (e) {
        if (e.code !== "ENOENT") {
            throw e
        }
    }

    try {
        const packData = JSON.parse(await fsp.readFile(path.join(directory, "pack.json")))
        validate(validatePack, packData, path.join(directory, "pack.json"))
    } catch (e) {
        if (e.code !== "ENOENT") {
            throw e
        }
    }
}

async function checkExtensionDirectoryContents(directory) {
    const checks = (await fsp.readdir(directory)).map((extension) => {
        return [
            checkJsons(path.join(directory, extension)),
            checkDirectoryContents(path.join(directory, extension)),
            checkIcons(path.join(directory, extension))
        ]
    }).flat()

    await Promise.all(checks)

    console.log(`All extensions in ${styleText("green", path.relative(rootFolder, directory))} are ${styleText('green', 'OK')}`)
}

function validate(validator, extensionData, p) {
    const res = validator(extensionData)
    if (!res) {
        console.error(`Schema ${styleText("red", path.relative(registryFolder, p))}:`, styleText("red", "failed"))
        console.error(validator.errors)
        process.exit(1)
    }
}

function validateExtensionData(ext) {
    const iData = {
        id: ext.info.id,
        vendorId: ext.info.vendor_id,
        display_name: ext.info.display_name,
        display_vendor: ext.info.display_vendor,
    }

    for (version in ext.versions) {
        const v = ext.versions[version]
        const metaData = v.metadata

        const vData = {
            id: metaData.Id,
            vendorId: metaData.VendorId,
            display_name: metaData.Name,
            display_vendor: metaData.Vendor,
        }

        if (JSON.stringify(vData) !== JSON.stringify(iData)) {
            console.error(`Version "${version}" metadata ("${styleText("green", JSON.stringify(iData))}") does not match ("${styleText("red", JSON.stringify(vData))}")`)
            process.exit(1)
        }

        if (version !== metaData.Version) {
            console.error(`The metadata version field (${styleText("green", metaData.Version)}) does not match the key ${styleText("red", version)}`)
            process.exit(1)
        }
    }
}

checkExtensionDirectoryContents(registryFolder)
