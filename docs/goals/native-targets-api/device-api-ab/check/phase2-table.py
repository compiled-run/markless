# Builds scores.csv (phase 2 rows) from the type-check results, the checker name counts, the two graders' JSON and the raw answers.
import sys,json,os,re,glob,statistics as st,csv
D=sys.argv[1]; G=sys.argv[2]; NAMES=sys.argv[3]
names=json.loads(open(NAMES).read().strip().splitlines()[-1])
grades={}
for f in sorted(glob.glob(G+'/*.json')):
    d=json.load(open(f)); grades.setdefault(d['label'],[]).append(d)
rows=[]
for L in ['EJ','UW','AU','KO','MS','BC']:
    for n in range(1,6):
        w=f"{D}/check/work/p2-{L}-{n}"
        raw=open(f"{D}/raw/phase2/{L}-{n}.md").read()
        conf=[int(x) for x in re.findall(r'Confidence:\s*(\d)/5',raw)]
        gsec=raw.split('## Guesses',1)[1] if '## Guesses' in raw else ''
        guesses=len(re.findall(r'^\s*(?:[-*]|\d+\.)\s',gsec,re.M)) or len([p for p in gsec.split('\n\n') if p.strip() and not p.strip().startswith('Tools used')])
        res=json.load(open(f"{w}/result.json"))
        for t in range(1,9):
            td=f"{w}/task{t}"
            loc=sum(1 for fn in os.listdir(td) for line in open(f"{td}/{fn}") if line.strip()) if os.path.isdir(td) else 0
            g=[x['answers'][f'A{n}'][str(t)] for x in grades[L]]
            rows.append(dict(design=L,consumer=n,task=t,lines=loc,
                deviceExports=names[f"p2-{L}-{n}"].get(str(t),{}).get('exports',0),
                confidence=conf[t-1] if len(conf)>=8 else '',
                offSheet_g1=g[0]['offSheet'],offSheet_g2=g[1]['offSheet'],misuse_g1=g[0]['misuse'],misuse_g2=g[1]['misuse'],
                missing_g1=len(g[0]['missing']),missing_g2=len(g[1]['missing']),
                tscParseErrors=res[str(t)]['parse'],tscTypeErrors=res[str(t)]['type'],guessesListed=guesses))
with open(f"{D}/scores.csv","w",newline='') as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
dis=[r for r in rows if abs(r['offSheet_g1']-r['offSheet_g2'])>1 or abs(r['misuse_g1']-r['misuse_g2'])>1 or abs(r['missing_g1']-r['missing_g2'])>1]
print('rows',len(rows),'grader disagreements >1:',len(dis))
for L in ['EJ','UW','AU','KO','MS','BC']:
    R=[r for r in rows if r['design']==L]
    per=lambda k:[sum(r[k] for r in R if r['consumer']==n) for n in range(1,6)]
    loc=per('lines'); ex=per('deviceExports'); tsc=per('tscTypeErrors')
    conf=[round(st.mean(r['confidence'] for r in R if r['consumer']==n),2) for n in range(1,6)]
    mis=[sum((r['offSheet_g1']+r['offSheet_g2']+r['misuse_g1']+r['misuse_g2'])/2 for r in R if r['consumer']==n) for n in range(1,6)]
    miss=[sum((r['missing_g1']+r['missing_g2'])/2 for r in R if r['consumer']==n) for n in range(1,6)]
    gu=[next(r['guessesListed'] for r in R if r['consumer']==n) for n in range(1,6)]
    print(f"{L} lines {loc} mean {st.mean(loc):.0f} range {min(loc)}-{max(loc)} | exports {ex} | conf {conf} mean {st.mean(conf):.2f} | mistakes {mis} | missing {miss} | tscType {tsc} | guesses {gu}")
for L in ['EJ','UW','AU','KO','MS','BC']:
    R=[r for r in rows if r['design']==L]
    print(L,'lines/task',[round(st.mean(r['lines'] for r in R if r['task']==t),1) for t in range(1,9)],'conf/task',[round(st.mean(r['confidence'] for r in R if r['task']==t),1) for t in range(1,9)],'exports/task',[round(st.mean(r['deviceExports'] for r in R if r['task']==t),1) for t in range(1,9)])
