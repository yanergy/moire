// Mark what changed between two rendered versions of a Markdown file, for the
// diff's rendered view. Works on blocks, like GitHub's rich diff at a coarse level:
// each side's top-level blocks (paragraphs, headings, tables, code blocks, and the
// items of lists and quotes) are matched up with a longest common subsequence, and
// the unmatched ones are tagged: removed on the old side, added on the new side. A
// block that was edited shows as removed on the left and added on the right.

const CHANGED_CLASS = { old: 'pr-md-removed', new: 'pr-md-added' } as const;

// Containers whose children are compared one by one, so editing one list item does
// not mark the whole list.
const SPLIT_TAGS = new Set(['UL', 'OL', 'BLOCKQUOTE']);

// Above this many block pairs the comparison is skipped (both sides render plain),
// so a huge file cannot stall the view.
const MAX_CELLS = 4_000_000;

function blocksOf(root: ParentNode): Element[] {
    const blocks: Element[] = [];
    for (const child of root.children) {
        if (SPLIT_TAGS.has(child.tagName) && child.children.length) {
            blocks.push(...blocksOf(child));
        } else {
            blocks.push(child);
        }
    }

    return blocks;
}

// What a block is compared by: its markup, minus the task checkbox index, which
// shifts for every item after an inserted one even though those items are the same.
function keyOf(block: Element): string {
    return block.outerHTML.replace(/ data-task-index="\d+"/g, '');
}

// Which blocks on each side are part of the longest common subsequence.
function matched(a: string[], b: string[]): { a: boolean[]; b: boolean[] } {
    const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
        Array.from({ length: b.length + 1 }, () => 0)
    );
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            lengths[i]![j] =
                a[i] === b[j]
                    ? lengths[i + 1]![j + 1]! + 1
                    : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
        }
    }

    const inA = Array.from({ length: a.length }, () => false);
    const inB = Array.from({ length: b.length }, () => false);
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            inA[i++] = true;
            inB[j++] = true;
        } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
            i++;
        } else {
            j++;
        }
    }

    return { a: inA, b: inB };
}

// Tag the changed blocks of two sanitized HTML strings. Parsed in inert templates,
// so nothing (images) loads. Returns the inputs unchanged when the file is too big
// to compare.
export function highlightBlockChanges(
    oldHtml: string,
    newHtml: string
): { oldHtml: string; newHtml: string } {
    const oldDoc = document.createElement('template');
    const newDoc = document.createElement('template');
    oldDoc.innerHTML = oldHtml;
    newDoc.innerHTML = newHtml;

    const oldBlocks = blocksOf(oldDoc.content);
    const newBlocks = blocksOf(newDoc.content);
    if (oldBlocks.length * newBlocks.length > MAX_CELLS) {
        return { oldHtml, newHtml };
    }

    const kept = matched(oldBlocks.map(keyOf), newBlocks.map(keyOf));
    oldBlocks.forEach((block, i) => {
        if (!kept.a[i]) {
            block.classList.add(CHANGED_CLASS.old);
        }
    });
    newBlocks.forEach((block, i) => {
        if (!kept.b[i]) {
            block.classList.add(CHANGED_CLASS.new);
        }
    });

    return { oldHtml: oldDoc.innerHTML, newHtml: newDoc.innerHTML };
}
