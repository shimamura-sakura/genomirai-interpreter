'use strict';

const geno = require('./genomirai.json');
const assert = require('assert');

// Linux specific
const echo = (() => {
    try {
        const termios = require('node-termios');
        return function echo(b) {
            const t = new termios.Termios(process.stdin.fd);
            if (b) t.c_lflag |= termios.native.LFLAGS.ECHO;
            else t.c_lflag &= ~termios.native.LFLAGS.ECHO;
            t.writeTo(process.stdin.fd, termios.native.ACTION.TCSANOW);
        };
    } catch {
        process.stdout.write('== cannot import node-termios -> cannot turn off echo ==\n\n');
        return function echo(b) { };
    };
})();

// Platform specific
let onenter = [];
const stdin = process.stdin;
stdin.resume();
stdin.setEncoding('utf-8');
stdin.on('data', data => onenter.pop()?.(data));
function sleep(time) {
    time = Math.max(time, 5);
    return new Promise(resolve => setTimeout(() => resolve(), time));
}
function print(str) {
    process.stdout.write(str);
}
function color(clr) {
    if (!clr) return void (print('\x1b[0m'));
    assert(clr.startsWith('#'), 'invalid color');
    const rgb = parseInt(clr.substring(1), 16);
    const r = (rgb >> 0x10) & 0xFF;
    const g = (rgb >> 0x08) & 0xFF;
    const b = (rgb >> 0x00) & 0xFF;
    print(`\x1b[38;2;${r};${g};${b}m`);
}
function waits() {
    return input();
}
function input() {
    return new Promise(resolve => onenter.push(resolve));
}
// End Platform specific

function evalcond(vars, cond) {
    const segs = cond.split(/\s+/g);
    const name = segs[0];
    const cmp = segs[1];
    const val = parseInt(segs[2]);
    assert(name in vars, `undefined condition var ${name}`);
    switch (cmp) {
        case '==': return vars[name] == val;
        case '<': return vars[name] < val;
        default: assert(false, `invalid compare operation ${cmp}`);
    }
}

function evalflag(vars, name, cmd) {
    assert(name in vars, `undefined condition var ${name}`);
    if (cmd.add) return void (vars[name] += cmd.add);
    if (cmd.sub) return void (vars[name] -= cmd.sub);
    if (cmd.set) return void (vars[name] = cmd.set);
    assert(false, `invalid flag operation ${cmd} on ${name}`);
}

function jump(tags, tag) {
    assert(tag in tags, `undefined tag ${tag}`);
    return tags[tag];
}

async function main() {
    // 0. State
    let prev = null;
    let sels = null;
    const vars = {
        ef_flag_00: 0,
        ef_flag_01: 0,
        ef_flag_02: 0,
        ef_flag_03: 0,
        ef_flag_04: 0,
        ef_flag_05: 0,
        ef_flag_06: 0,
        ef_flag_07: 0,
        ef_flag_08: 0,
        ef_flag_09: 0,
    };
    // 1. Tag Lookup
    const tags = {};
    for (let i = 0; i < geno.length; i++) {
        const inst = geno[i];
        if (inst.process == 'EVENT_PROCESS_TAG') {
            assert(!(inst.param1 in tags), "tag already defined");
            tags[inst.param1] = i;
        }
    }
    // 2. Interpret
    echo(false);
    next_inst: for (let i = 0; i < geno.length; i++) {
        const inst = geno[i];
        if (sels && inst.process != 'EVENT_PROCESS_SEL') {
            while (true) {
                print('\n');
                let answer = '';
                while (answer.length == 0) {
                    print('Select No. = ');
                    echo(true);
                    answer = (await input()).trim();
                    echo(false);
                }
                const choice = parseInt(answer);
                if (isNaN(choice) || choice < 1 || choice > sels.length) {
                    print('\nID_TNK_PROCESS_ERROR.');
                    print(`\nCan't exploit at "${answer}" process.\n`);
                    for (let j = 0; j < sels.length; j++)
                        print(`\n  ${j + 1}.${sels[j].text}`);
                } else {
                    i = jump(tags, sels[choice - 1].tag);
                    sels = null;
                    continue next_inst;
                }
            }
        }
        switch (inst.process) {
            case 'EVENT_PROCESS_WAIT':
                await sleep(parseFloat(inst.param1));
                break;

            case '':
            case 'EVENT_PROCESS_AUTO_PLAY': {
                if (inst.text.startsWith('▼')) continue;
                const notsimple = inst.text != '<br>' && inst.param2 != 'off';
                if (notsimple) {
                    print('\n');
                    if (inst.name == '') {
                        if (prev && prev.name != '')
                            print('\n');
                    } else if (prev && inst.name == prev.name) {
                        print(' '.repeat(11));
                    } else {
                        if (prev && !(inst.name.startsWith('SH_') && prev.name.startsWith('SH_')))
                            print('\n');
                        print(inst.name == '行動ログ' ? ' '.repeat(11) : inst.name);
                    }
                }
                if (inst.param3) color(inst.param3);
                const interval = inst.param1 != '' ? parseFloat(inst.param1) : null;
                for (const ch of inst.text.replace(/<br>/g, '\n')) {
                    if (interval) await sleep(interval);
                    print(ch);
                }
                if (inst.param3) color();
                prev = { name: inst.name };
                if (inst.process == '' && notsimple) await waits();
            } break;
            case 'EVENT_PROCESS_IP_VALUE':
                print('127.0.0.1\n');
                break;
            case 'EVENT_PROCESS_TAG':
                break;
            case 'EVENT_PROCESS_IF':
                if (evalcond(vars, inst.param1))
                    break;
                for (; i < geno.length; i++)
                    if (geno[i].process == 'EVENT_PROCESS_ENDIF')
                        break;
                break;
            case 'EVENT_PROCESS_ENDIF':
                break;
            case 'EVENT_PROCESS_SEL':
                if (inst.param2 && !evalcond(vars, inst.param2))
                    break;
                if (!sels) sels = [];
                sels.push({ text: inst.text, tag: inst.param1 });
                if (prev && prev.name != 'SEL') print('\n');
                print(`\n  ${sels.length}.${inst.text}`);
                prev = { name: 'SEL' };
                break;
            case 'EVENT_PROCESS_FLAG_ADD':
                evalflag(vars, inst.param1, { add: parseInt(inst.param2) });
                break;
            case 'EVENT_PROCESS_FLAG_VALUE':
                evalflag(vars, inst.param1, { add: parseInt(inst.param2) });
                break;
            case 'EVENT_PROCESS_JUMP':
                i = jump(tags, inst.param1);
                continue next_inst;
            default:
                assert(false, `unhandled inst.process ${inst.process}`);
        }
    }
    print('\n\n== GAME ENDED: Interpreter by Lipsum ==\n');
}

main().then(() => stdin.pause());