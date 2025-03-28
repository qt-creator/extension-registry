import Ajv from "ajv"
import { join, relative, basename, dirname } from "path"
import { createReadStream } from "fs"
import { readdir, stat, readFile } from "fs/promises"
import { styleText as styleTextOrg } from 'node:util'
import probe from 'probe-image-size'
import { fileURLToPath } from 'url';

import extensionSchema from "../schema/extension.schema.json" with {type: "json" }
import packSchema from "../schema/pack.schema.json" with {type: "json" }

import baseSchema from "../schema/base.schema.ref.json" with {type: "json" }
import sourceSchema from "../schema/source.schema.ref.json" with {type: "json" }
import versionSchema from "../schema/version.schema.ref.json" with {type: "json" }
import pluginMetaDataSchema from "../schema/plugin-meta-data.schema.ref.json" with {type: "json" }


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function styleText(color, text) {
    // Github actions don't have a real tty, so styleText will normally output monochrome text.
    // But we check if the "CI" env variable is set to "true" and if so, we disable the stream validation.
    return styleTextOrg(color, text, { validateStream: process.env.CI !== "true" })
}

const rootFolder = join(__dirname, "..")

const ajv = new Ajv({ allowUnionTypes: true })
ajv.addSchema(baseSchema)
ajv.addSchema(sourceSchema)
ajv.addSchema(versionSchema)
ajv.addSchema(pluginMetaDataSchema)

const validateExtension = ajv.compile(extensionSchema)
const validatePack = ajv.compile(packSchema)

const registryFolder = join(rootFolder, "registry")

async function checkDirectoryContents(directory) {
    console.log(`Checking ${styleText('green', relative(rootFolder, directory))}`)
    const allowedFiles = ["extension.json", "pack.json", "icon.png", "icon@2x.png"]

    const files = await readdir(directory)
    if (!files.includes("extension.json") && !files.includes("pack.json")) {
        console.error(`No extension or pack found in ${styleText('red', relative(rootFolder, directory))}`)
        process.exit(1)
    }

    for (const file of files) {
        if (!allowedFiles.includes(file)) {
            console.error(`Unexpected file found in ${styleText('green', relative(rootFolder, directory))}: ${styleText('red', file)}`)
            console.log('Allowed files:', allowedFiles)
            process.exit(1)
        }
    }
}

async function checkFileSize(file, maxSize) {
    const fileSize = (await stat(file)).size
    if (fileSize > maxSize) {
        console.error(`File ${styleText("green", relative(rootFolder, file))} is too large: ${styleText("red", `${fileSize} bytes`)}`)
        process.exit(1)
    }
}

async function checkImageSize(image, expectedSize) {
    const iconInfo = await probe(createReadStream(image));
    if (iconInfo.mime !== 'image/png' || iconInfo.type !== 'png') {
        console.error(`Icon ${styleText("green", relative(rootFolder, icon))} is not a PNG file`)
        process.exit(1)
    }

    if (iconInfo.width !== expectedSize || iconInfo.height !== expectedSize) {
        console.error(`Icon ${styleText("green", relative(rootFolder, image))} has the wrong size: ${styleText("red", `${iconInfo.width}x${iconInfo.height}`)}`)
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
    const files = await readdir(directory)
    const icons = files.filter((file) => file === "icon.png" || file === "icon@2x.png")
    if (icons.length === 0) {
        return
    }
    if (icons.length === 1) {
        console.error(`Only one icon found in ${styleText("green", relative(rootFolder, directory))}`)
        process.exit(1)
    }

    await Promise.all([
        checkIcon(join(directory, "icon.png"), 16),
        checkIcon(join(directory, "icon@2x.png"), 32)
    ])
}

async function checkJsons(directory) {
    try {
        const extensionData = JSON.parse(await readFile(join(directory, "extension.json")))
        const fullId = `${extensionData.info.vendor_id}.${extensionData.info.id}`
        if (fullId !== basename(directory)) {
            console.error(`The extension id (${styleText("green", fullId)}) does not match the directory name (${styleText("red", basename(directory))})`)
            process.exit(1)
        }
        validate(validateExtension, extensionData, join(directory, "extension.json"))
        validateExtensionData(extensionData)
    } catch (e) {
        if (e.code !== "ENOENT") {
            throw e
        }
    }

    try {
        const packData = JSON.parse(await readFile(join(directory, "pack.json")))
        validate(validatePack, packData, join(directory, "pack.json"))
    } catch (e) {
        if (e.code !== "ENOENT") {
            throw e
        }
    }
}

async function checkExtensionDirectoryContents(directory) {
    const checks = (await readdir(directory)).map((extension) => {
        return [
            checkJsons(join(directory, extension)),
            checkDirectoryContents(join(directory, extension)),
            checkIcons(join(directory, extension))
        ]
    }).flat()

    await Promise.all(checks)

    console.log(`All extensions in ${styleText("green", relative(rootFolder, directory))} are ${styleText('green', 'OK')}`)
}

function validate(validator, extensionData, p) {
    const res = validator(extensionData)
    if (!res) {
        console.error(`Schema ${styleText("red", relative(registryFolder, p))}:`, styleText("red", "failed"))
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

    if (ext.versions[ext.latest] === undefined) {
        console.error(`Latest version ${styleText("red", ext.latest)} does not exist in versions`)
        process.exit(1)
    }

    for (const version in ext.versions) {
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
