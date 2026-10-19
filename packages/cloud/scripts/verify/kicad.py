import pcbnew as p
from pathlib import Path
b=p.BOARD()
for a,z in [((20,20),(60,20)),((60,20),(60,45)),((60,45),(20,45)),((20,45),(20,20))]:
 edge=p.PCB_SHAPE();edge.SetShape(p.SHAPE_T_SEGMENT);edge.SetStart(p.VECTOR2I(p.FromMM(a[0]),p.FromMM(a[1])));edge.SetEnd(p.VECTOR2I(p.FromMM(z[0]),p.FromMM(z[1])));edge.SetLayer(p.Edge_Cuts);edge.SetWidth(p.FromMM(.1));b.Add(edge)
t=p.PCB_TEXT(b);t.SetText('AVENIRE / render check');t.SetPosition(p.VECTOR2I(p.FromMM(40),p.FromMM(25)));t.SetTextSize(p.VECTOR2I(p.FromMM(1),p.FromMM(1)));t.SetLayer(p.F_SilkS);b.Add(t)
for x in [28,50]:
 fp=p.FOOTPRINT(b);fp.SetReference('J'+str(x));fp.SetValue('Test point');fp.SetPosition(p.VECTOR2I(p.FromMM(x),p.FromMM(35)))
 pad=p.PAD(fp);pad.SetNumber('1');pad.SetAttribute(p.PAD_ATTRIB_PTH);pad.SetShape(p.PAD_SHAPE_CIRCLE);pad.SetSize(p.VECTOR2I(p.FromMM(3),p.FromMM(3)));pad.SetDrillSize(p.VECTOR2I(p.FromMM(1),p.FromMM(1)));pad.SetLayerSet(p.LSET.AllCuMask());pad.SetPosition(fp.GetPosition());fp.Add(pad);b.Add(fp)
track=p.PCB_TRACK(b);track.SetStart(p.VECTOR2I(p.FromMM(28),p.FromMM(35)));track.SetEnd(p.VECTOR2I(p.FromMM(50),p.FromMM(35)));track.SetWidth(p.FromMM(.6));track.SetLayer(p.F_Cu);b.Add(track)
p.SaveBoard('renders/check.kicad_pcb',b)
Path('renders/check.kicad_sch').write_text('''(kicad_sch (version 20250114) (generator "eeschema")
 (uuid "45937a6b-c768-4124-9fe2-244e42e76276") (paper "A5") (lib_symbols)
 (text "Avenire verification schematic" (at 60 50 0) (effects (font (size 2 2))) (uuid "5776e651-5c90-4916-8bb4-f7d8f959a592"))
 (wire (pts (xy 50 60) (xy 90 60)) (stroke (width 0) (type default)) (uuid "0d416ce0-1837-4767-bb8e-a8597e487e53"))
 (label "SIGNAL" (at 50 60 0) (effects (font (size 1.27 1.27)) (justify left bottom)) (uuid "f174f89d-d5fe-49ba-8197-c17dfc784f75"))
 (sheet_instances (path "/" (page "1"))))''')
print(p.Version())
