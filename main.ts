import chalk from "chalk"
import { readFile, writeFile } from "fs/promises"
import Tinyqueue from "tinyqueue"

type Frequencies = Record<string, number>

const frequencies = (input: string): Frequencies => {
    const result: Frequencies = {}
    for (const char of input) result[char] = (result[char] || 0) + 1
    return result
}

/**
 * For every character in b that is not in a, add it to a with a value of 0
 */
const populateFq = (a: Frequencies, b: Frequencies) => {
    for (const char of Object.keys(b)) if (!a[char]) a[char] = 0
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

const buildTree = (q: Tinyqueue<Item>): [Record<string, string>, BTree] => {
    const isBTree = (node: Item): node is BTree => (node as BTree).btree === true
    const charToBTree = (char: Character): BTree => new BTree(char.value, char.character, null, null)
    const combine = (a: Item, b: Item): BTree => {
        const value = a.value + b.value
        if (!isBTree(a)) a = charToBTree(a)
        if (!isBTree(b)) b = charToBTree(b)
        return new BTree(value, "", a as BTree, b as BTree)
    }

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

const huffmanLength = (fq: Frequencies, codes: Record<string, string>) =>
    Object.entries(fq).reduce((acc, [char, value]) => {
        if (!codes[char]) throw new Error(`No code for ${char.codePointAt(0)}`)
        return acc + value * codes[char].length
    }, 0)

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

const fixedBitEncoding = (frequencies: Record<string, number>) => {
    const characters = Object.keys(frequencies).length
    return Math.ceil(Math.log2(characters))
}

const SEP = "       "
const getAverageFrequencies = async (): Promise<Frequencies> => {
    const text = await readFile("./data/frequencies.txt", "utf-8")
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

const timeFunc = <T>(f: () => T, message: string) => {
    const start = performance.now()
    const value = f()
    console.log(chalk.blue(`${(performance.now() - start).toFixed(2)}ms to ${message}`))
    return value
}

const output = async (codes: Record<string, string>, base: BTree, mod = "") => {
    mod = mod ? `-${mod}` : ""
    await writeFile(`./out/output${mod}.json`, JSON.stringify({ codes, base }, null, 4))
    await writeFile(`./out/output-tree${mod}.txt`, base.visualize(codes))
    console.log(chalk.gray("> Outputted to ./output.json & ./output-tree.txt"))
    console.log(chalk.gray(`> Tree size: ${Object.keys(codes).length}`))
}

const verify = (input: string, codes: Record<string, string>, base: BTree) => {
    const encoded = encode(input, codes)
    const decoded = decode(encoded, base)
    if (input === decoded) {
        console.log(chalk.green("Verification successful"))
    } else {
        console.log(chalk.red("Verification failed"))
    }
}

const pqFromFrequencies = (fq: Frequencies) => {
    const pq = new Tinyqueue<Item>(undefined, (a, b) => a.value - b.value)
    for (const [character, value] of Object.entries(fq)) pq.push({ character, value })
    return pq
}

/**
 * How much smaller is a from b
 */
const percentDiff = (a: number, b: number) => (((a - b) / a) * 100).toFixed(2)

const main = async () => {
    const mobyDick = await readFile("./data/moby.txt", "utf-8")
    const fq = frequencies(mobyDick)

    const pq = pqFromFrequencies(fq)
    const [codes, base] = timeFunc(() => buildTree(pq), "create codes")

    await output(codes, base)
    verify(mobyDick, codes, base)

    const huffmanSize = huffmanLength(fq, codes)
    const fixedSize = mobyDick.length * fixedBitEncoding(fq)

    console.log(chalk.yellow(`${huffmanSize.toLocaleString("en-US")} bits for huffman encoding`))
    console.log(chalk.yellow(`${fixedSize.toLocaleString("en-US")} bits for fixed encoding`))
    console.log(chalk.yellow(`${percentDiff(fixedSize, huffmanSize)}% space saved`))

    // Challenge #1
    console.log(chalk.redBright("\nChallenge #1\n"))

    const averageFq = await getAverageFrequencies()
    populateFq(averageFq, fq)

    const newPq = pqFromFrequencies(averageFq)
    const [avgCodes, avgBase] = timeFunc(() => buildTree(newPq), "create average codes")

    await output(avgCodes, avgBase, "avg")
    verify(mobyDick, avgCodes, avgBase)

    const avgSize = huffmanLength(fq, avgCodes)

    console.log(chalk.yellow(`${avgSize.toLocaleString("en-US")} bits for average huffman encoding`))
    console.log(chalk.yellow(`${percentDiff(fixedSize, avgSize)}% space saved`))
    console.log(chalk.yellow(`Huffman ${percentDiff(avgSize, huffmanSize)}% better`))

    // Challenge #2
    console.log(chalk.redBright("\nChallenge #2\n"))

    const otherBook = await readFile("./data/other.txt", "utf-8")
    const otherFq = frequencies(otherBook)

    // Since this book has chars not in avg or moby, we need to re-calculate the average and huffman codes
    populateFq(fq, otherFq)
    populateFq(averageFq, otherFq)

    const [newCodes] = timeFunc(() => buildTree(pqFromFrequencies(fq)), "create new codes")
    const [newAvgCodes] = timeFunc(() => buildTree(pqFromFrequencies(averageFq)), "create new average codes")

    const otherAvgSize = huffmanLength(otherFq, newAvgCodes)
    const otherHuffmanSize = huffmanLength(otherFq, newCodes)
    const otherFixedSize = otherBook.length * fixedBitEncoding(otherFq)

    console.log(chalk.yellow(`${otherAvgSize.toLocaleString("en-US")} bits for average huffman encoding`))
    console.log(chalk.yellow(`${otherHuffmanSize.toLocaleString("en-US")} bits for huffman encoding`))
    console.log(chalk.yellow(`Huffman is ${percentDiff(otherAvgSize, otherHuffmanSize)}% better than avg`))
    console.log(chalk.yellow(`${otherFixedSize.toLocaleString("en-US")} bits for fixed encoding`))
    console.log(
        chalk.yellow(
            `NewCodes Length: ${Object.keys(newCodes).length} | NewAvgCodes Length: ${Object.keys(newAvgCodes).length}`
        )
    )
}
main()
