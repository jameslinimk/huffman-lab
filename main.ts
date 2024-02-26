import chalk from "chalk"
import { readFile, writeFile } from "fs/promises"
import Tinyqueue from "tinyqueue"

type Frequencies = Record<string, number>

const frequencies = (input: string): Frequencies => {
    const result: Frequencies = {}
    for (const char of input) result[char] = (result[char] || 0) + 1
    return result
}

interface Character {
    character: string
    value: number
}

class BTree {
    btree = true
    constructor(
        public value: number,
        public character: string,
        public left: BTree | null,
        public right: BTree | null
    ) {}

    static visualizeBTree = (
        codes: Record<string, string>,
        node: BTree | null,
        prefix: string = "",
        isLeft: boolean = true
    ) => {
        if (node === null) return ""

        let char = node.character
        switch (char.codePointAt(0)) {
            case 10:
                char = "LF"
                break
            case 13:
                char = "CR"
                break
            case 32:
                char = "SP"
                break
        }

        const nodeRepresentation = `${prefix}${isLeft ? "├── " : "└── "}${node.character !== "" ? char : "🞄"} (${
            node.value
        }${codes[node.character] ? `, ${codes[node.character]}` : ""})\n`

        const newPrefix = prefix + (isLeft ? "│   " : "    ")
        const left = BTree.visualizeBTree(codes, node.left, newPrefix, true)
        const right = BTree.visualizeBTree(codes, node.right, newPrefix, false)

        return nodeRepresentation + left + right
    }

    visualize = (codes: Record<string, string>) => BTree.visualizeBTree(codes, this)
}

type Item = BTree | Character

const isBTree = (node: Item): node is BTree => (node as BTree).btree === true

const charToBTree = (char: Character): BTree => new BTree(char.value, char.character, null, null)
const combine = (a: Item, b: Item): BTree => {
    const value = a.value + b.value
    if (!isBTree(a)) a = charToBTree(a)
    if (!isBTree(b)) b = charToBTree(b)
    return new BTree(value, "", a as BTree, b as BTree)
}

const createCodes = (q: Tinyqueue<Item>): [Record<string, string>, BTree] => {
    let current = q.pop()
    while (current) {
        let deck = q.pop()
        if (!deck) break

        const combined = combine(current, deck)
        q.push(combined)

        current = q.pop()
    }

    const base = current as BTree
    if (!isBTree(base)) throw new Error()

    // Traverse tree
    const codes = {}
    const traverse = (node: BTree | null, path: string, codes: Record<string, string>) => {
        if (!node) return

        if (node.character) {
            codes[node.character] = path
            return
        }

        traverse(node.left, path + "0", codes)
        traverse(node.right, path + "1", codes)
    }
    traverse(base, "", codes)
    return [codes, base]
}

const bitLength = (fq: Frequencies, codes: Record<string, string>) =>
    Object.entries(fq).reduce((acc, [char, value]) => acc + value * codes[char].length, 0)

const encode = (input: string, codes: Record<string, string>): string => {
    let output = ""
    for (const char of input) output += codes[char]
    return output
}

const decode = (encoded: string, tree: BTree): string => {
    let decoded = ""
    let node = tree
    for (const bit of encoded) {
        node = bit === "0" ? node.left! : node.right!
        if (node.character) {
            decoded += node.character
            node = tree
        }
    }
    return decoded
}

const timeFunc = <T>(f: () => T, message: string) => {
    const start = performance.now()
    const value = f()
    console.log(chalk.blue(`${(performance.now() - start).toFixed(2)}ms to ${message}`))
    return value
}

const fixedBitEncoding = (frequencies: Record<string, number>) => {
    const characters = Object.keys(frequencies).length
    return Math.ceil(Math.log2(characters))
}

const SEP = "       "
const getAverageFrequencies = async (): Promise<Frequencies> => {
    const text = await readFile("frequencies.txt", "utf-8")
    return Object.fromEntries(
        text
            .split("\n")
            .filter((line) => line && line.slice(1).startsWith(SEP))
            .map((line) => {
                const [char, value] = line.split(SEP)
                return [char, parseFloat(value)]
            })
    )
}

const avgBitLength = (codes: Record<string, string>) => {
    const characters = Object.keys(codes).length
    return Object.values(codes).reduce((acc, code) => acc + code.length, 0) / characters
}

const main = async () => {
    const input = await readFile("moby-dick.txt", "utf-8")
    const fq = frequencies(input)

    const pq = new Tinyqueue<Item>(undefined, (a, b) => a.value - b.value)
    for (const [character, value] of Object.entries(fq)) pq.push({ character, value })

    const [codes, base] = timeFunc(() => createCodes(pq), "create codes")

    await writeFile("./output.json", JSON.stringify({ codes, base }, null, 4))
    await writeFile("./output-tree.txt", base.visualize(codes))
    console.log(chalk.gray("> Outputted to ./output.json & ./output-tree.txt"))
    console.log(chalk.gray(`> Tree size: ${Object.keys(codes).length}`))

    const encoded = timeFunc(() => encode(input, codes), "encode")
    const decoded = timeFunc(() => decode(encoded, base), "decode")

    if (input === decoded) {
        console.log(chalk.green("Verification successful"))
    } else {
        console.log(chalk.red("Verification failed"))
    }

    const huffmanSize = bitLength(fq, codes)
    const fixedSize = input.length * fixedBitEncoding(fq)

    console.log(chalk.yellow(`${huffmanSize.toLocaleString("en-US")} bits for huffman encoding`))
    console.log(chalk.yellow(`${fixedSize.toLocaleString("en-US")} bits for huffman encoding`))
    console.log(chalk.yellow(`${(((fixedSize - huffmanSize) / fixedSize) * 100).toFixed(2)}% space saved`))

    // Challenge #1

    console.log(chalk.redBright("\nChallenge #1\n"))

    const averages = await getAverageFrequencies()
    Object.keys(fq).forEach((char) => {
        if (!averages[char]) averages[char] = 0
    })

    const newPq = new Tinyqueue<Item>(undefined, (a, b) => a.value - b.value)
    for (const [character, value] of Object.entries(averages)) newPq.push({ character, value })

    const [avgCodes, avgBase] = timeFunc(() => createCodes(newPq), "create average codes")

    await writeFile("./output-avg.json", JSON.stringify({ codes: avgCodes, base: avgBase }, null, 4))
    await writeFile("./output-avg-tree.txt", avgBase.visualize(avgCodes))
    console.log(chalk.gray("> Outputted to ./output-avg.json & ./output-avg-tree.txt"))
    console.log(chalk.gray(`> Tree size: ${Object.keys(avgCodes).length}`))

    const avgEncoded = timeFunc(() => encode(input, avgCodes), "encode average")
    const avgDecoded = timeFunc(() => decode(avgEncoded, avgBase), "decode average")

    if (input === avgDecoded) {
        console.log(chalk.green("Verification successful"))
    } else {
        console.log(chalk.red("Verification failed"))
    }

    const avgSize = bitLength(fq, avgCodes)
    console.log(chalk.yellow(`${avgSize.toLocaleString("en-US")} bits for average huffman encoding`))
    console.log(chalk.yellow(`${(((fixedSize - avgSize) / fixedSize) * 100).toFixed(2)}% space saved`))
    console.log(chalk.yellow(`Huffman ${(((avgSize - huffmanSize) / avgSize) * 100).toFixed(2)}% better`))

    // Challenge #2

    console.log(chalk.redBright("\nChallenge #2\n"))

    const otherBook = await readFile("other.txt", "utf-8")
    const otherFq = frequencies(otherBook)

    const otherPq = new Tinyqueue<Item>(undefined, (a, b) => a.value - b.value)
    for (const [character, value] of Object.entries(otherFq)) otherPq.push({ character, value })

    const [otherCodes, otherBase] = timeFunc(() => createCodes(otherPq), "create other codes")

    await writeFile("./output-other.json", JSON.stringify({ codes: otherCodes, base: otherBase }, null, 4))
    await writeFile("./output-other-tree.txt", otherBase.visualize(otherCodes))
    console.log(chalk.gray("> Outputted to ./output-other.json & ./output-other-tree.txt"))
    console.log(chalk.gray(`> Tree size: ${Object.keys(otherCodes).length}`))

    const otherEncoded = timeFunc(() => encode(otherBook, otherCodes), "encode other")
    const otherDecoded = timeFunc(() => decode(otherEncoded, otherBase), "decode other")

    if (otherBook === otherDecoded) {
        console.log(chalk.green("Verification successful"))
    } else {
        console.log(chalk.red("Verification failed"))
    }

    const otherSize = bitLength(otherFq, otherCodes)
    // const otherUsingHuffman = bitLength(otherFq, codes)
    // const otherUsingAvg = bitLength(otherFq, avgCodes)
    // const otherFixed = otherBook.length * fixedBitEncoding(otherFq)

    // console.log(chalk.yellow(`${otherSize.toLocaleString("en-US")} bits for other huffman encoding`))
    // console.log(chalk.yellow(`Huffman ${(((otherSize - otherUsingHuffman) / otherSize) * 100).toFixed(2)}% better`))
    // console.log(chalk.yellow(`Average ${(((otherSize - otherUsingAvg) / otherSize) * 100).toFixed(2)}% better`))
}
main()
