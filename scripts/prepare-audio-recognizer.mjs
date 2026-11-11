
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { exec } from 'node:child_process'
import { promisify } from 'node:util';

const execAsync = promisify(exec)

const ModelsFolder = 'data/models'
const TempFileName = `${ModelsFolder}/temp.zip`
const BirdNETurl = 'https://zenodo.org/records/15050749/files/BirdNET_v2.4_tflite_fp16.zip'

const runCommand = async function(command) {
  try {
    const { stdout, stderr } = await execAsync(command)
    console.log(command)
    console.log(stdout)
    if (stderr) {
      console.error(stderr)
      return false
    }
  } catch (error) {
    console.error(error.message)
    return false
  }
  return true
}

mkdirSync(ModelsFolder, { recursive: true })

const response = await fetch(BirdNETurl, {
  headers: { 'User-Agent': 'KNP-birds/models-download' }
})
if (!response.ok) 
  throw new Error(`Download failed: ${response.status} ${response.statusText}`)

const data = Buffer.from(await response.arrayBuffer())

writeFileSync(TempFileName, data)

if (await runCommand(`unzip -q ${TempFileName} -d ${ModelsFolder}`))
    console.log(`BirdNET v2.4 fp16 is now in ${ModelsFolder}`)
unlinkSync(TempFileName)
