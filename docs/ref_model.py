import json, math

CFG = {
 "_notes": [
  "Planning/budgeting estimates ONLY. Never use for dive planning; decompression figures are budgeting placeholders.",
  "no_deco_table_min: indicative no-decompression limits (recreational-table style, unverified), for budgeting only. Bottom time = min(table limit, 45 min), where 45 min is the working-window cap applied on top of the dive table limit (at 10 m the table yields 219 min).",
  "verified=true: grounded in a source seen while building this. verified=false: assumption, replace with contractor quotes."
 ],
 "global": {"shift_hours": 10, "contingency_pct": 0.20, "mobilization_base_inr": 15000,
            "transit_cost_per_km_inr": 250, "default_distance_km": 25,
            "prefer_robotics_beyond_m": 40, "hard_max_human_depth_m": 100,
            "disposal_inr_per_kg": [8, 30], "disposal_min_inr": 1500},
 "role_rates_inr_per_hr": {"dive_supervisor":4500,"lead_diver":5000,"standby_diver":3800,"tender":1800,
                           "rov_pilot":4500,"rov_copilot":3800,"rov_engineer":3200},
 "debris_classes": {  # hours/item [min,max], kg/item [min,max], needs
  "trash_net":       {"h":[0.8,1.5],"kg":[5,40],  "tools":["cutters","lift bags"]},
  "trash_rope":      {"h":[0.3,0.6],"kg":[1,10],  "tools":["cutters"]},
  "trash_tarp":      {"h":[0.4,0.8],"kg":[2,10],  "tools":["lift bags"]},
  "trash_pipe":      {"h":[0.5,1.0],"kg":[10,60], "tools":["lift bags"]},
  "trash_wreckage":  {"h":[1.5,3.0],"kg":[50,500],"tools":["lift bags","hydraulic cutting tools"]},
  "trash_bag":       {"h":[0.1,0.2],"kg":[0.02,0.1],"tools":["collection sacks"]},
  "trash_bottle":    {"h":[0.05,0.1],"kg":[0.02,0.1],"tools":["collection sacks"]},
  "trash_container": {"h":[0.3,0.6],"kg":[5,30],  "tools":["collection sacks"]},
  "other_debris":    {"h":[0.2,0.4],"kg":[0.2,2], "tools":["collection sacks"]},
  "clothing":        {"h":[0.1,0.2],"kg":[0.2,1], "tools":["collection sacks"]},
  "unknown":         {"h":[0.2,0.5],"kg":[0.5,5], "tools":["collection sacks"]}
 },
 "no_deco_table_min": [[10,219],[12,147],[14,98],[16,72],[18,56],[20,45],[22,37],[25,29],[30,20],[35,14],[40,9]],
 "modes": {
  "scuba_team": {"kind":"human","depth_m":[0,40],"roles":["lead_diver","standby_diver","tender"],
     "bottom_time_h":"min(table limit, 45 min)","working_divers":2,"max_rot_per_diver_day":2,
     "descent_m_per_min":18,"ascent_m_per_min":9,"safety_stop_min":3,"deco_h_per_rotation":[[30,0.0],[40,0.1]],
     "equipment_inr_per_rotation":[1500,4000],"spread_inr_per_day":[0,0],"vessel_inr_per_day":[5000,25000],
     "gas_inr_per_rotation":[0,0],"max_item_kg":200,"risk":"medium","verified":{"equipment_inr_per_rotation":True,"vessel_inr_per_day":True,"no_deco_table_min":False}},
  "surface_supplied_air": {"kind":"human","depth_m":[30,50],"roles":["dive_supervisor","lead_diver","standby_diver","tender"],
     "bottom_time_h":0.75,"working_divers":1,"max_rot_per_diver_day":2,"descent_m_per_min":18,"ascent_m_per_min":9,
     "safety_stop_min":3,"deco_h_per_rotation":[[40,0.1],[50,0.75]],
     "equipment_inr_per_rotation":[0,0],"spread_inr_per_day":[40000,150000],"vessel_inr_per_day":[40000,150000],
     "gas_inr_per_rotation":[0,0],"max_item_kg":500,"risk":"high","verified":{"depth_m":True}},
  "mixed_gas_bell": {"kind":"human","depth_m":[50,100],"roles":["dive_supervisor","lead_diver","lead_diver","standby_diver","tender","tender"],
     "bottom_time_h":0.5,"working_divers":2,"max_rot_per_diver_day":1,"descent_m_per_min":18,"ascent_m_per_min":9,
     "safety_stop_min":0,"deco_h_per_rotation":[[75,2.0],[100,4.0]],
     "equipment_inr_per_rotation":[0,0],"spread_inr_per_day":[300000,1000000],"vessel_inr_per_day":[300000,1000000],
     "gas_inr_per_rotation":[20000,60000],"max_item_kg":1000,"risk":"very_high","verified":{"depth_m":True}},
  "compact_rov": {"kind":"robotics","depth_m":[0,100],"roles":["rov_pilot","tender"],"labour_excluded_roles":["rov_pilot"],"max_item_kg":5,
     "productive_h_per_day":6,"descent_m_per_min":30,"spread_inr_per_day":[25000,75000],"vessel_inr_per_day":[5000,25000],
     "risk":"low","verified":{"depth_m":True,"spread_inr_per_day":True,"vessel_inr_per_day":True}},
  "inspection_rov": {"kind":"robotics","depth_m":[0,300],"max_item_kg":25,"roles":["rov_pilot","rov_copilot","rov_engineer"],
     "productive_h_per_day":8,"descent_m_per_min":30,"spread_inr_per_day":[75000,200000],"vessel_inr_per_day":[40000,150000],
     "risk":"low","verified":{"depth_m":True}},
  "light_work_rov": {"kind":"robotics","depth_m":[0,1000],"roles":["rov_pilot","rov_copilot","rov_engineer","tender"],"max_item_kg":100,
     "productive_h_per_day":12,"descent_m_per_min":30,"spread_inr_per_day":[150000,300000],"vessel_inr_per_day":[40000,150000],
     "risk":"low","verified":{"depth_m":True}},
  "work_class_rov": {"kind":"robotics","depth_m":[0,3000],"max_item_kg":1000,"roles":["rov_pilot","rov_pilot","rov_copilot","rov_copilot","rov_engineer","rov_engineer"],
     "productive_h_per_day":20,"descent_m_per_min":30,"spread_inr_per_day":[250000,600000],"vessel_inr_per_day":[1000000,4000000],
     "risk":"low","verified":{"depth_m":True}}
 }
}

def interp(table, x):
    if x<=table[0][0]: return table[0][1]
    for (x0,y0),(x1,y1) in zip(table,table[1:]):
        if x0<=x<=x1: return y0+(y1-y0)*(x-x0)/(x1-x0)
    return table[-1][1]
def step_lookup(table, x):   # [[max_depth, value],...] -> first row with depth<=max
    for dmax,v in table:
        if x<=dmax: return v
    return table[-1][1]

def estimate_mode(name, m, depth, hrs, kg, dist_km):
    g=CFG["global"]; rates=CFG["role_rates_inr_per_hr"]; lo,hi=0,1
    crew=len(m["roles"]); labour_day=sum(rates[r] for r in m["roles"] if r not in m.get("labour_excluded_roles",[]))*g["shift_hours"]
    out={"mode":name,"kind":m["kind"],"crew":crew,"risk":m["risk"]}
    res=[]
    for i,h in enumerate(hrs):          # i=0 min, 1 max
        if m["kind"]=="human":
            bt = min(interp(CFG["no_deco_table_min"],depth) if depth>10 else 219,45)/60 if m["bottom_time_h"].__class__ is str else m["bottom_time_h"]
            overhead = depth/m["descent_m_per_min"]/60 + depth/m["ascent_m_per_min"]/60 + (m["safety_stop_min"]/60 if depth>10 else 0) + step_lookup(m["deco_h_per_rotation"],depth)
            rot=math.ceil(h/bt); days=max(1,math.ceil(rot/(m["working_divers"]*m["max_rot_per_diver_day"])))
            equip = rot*m["equipment_inr_per_rotation"][i] + days*m["spread_inr_per_day"][i] + rot*m["gas_inr_per_rotation"][i]
            extra={"rotations":rot,"bottom_time_h":round(bt,2),"overhead_h_per_rotation":round(overhead,2)}
        else:
            transit=2*depth/m["descent_m_per_min"]/60
            eff=max(1,m["productive_h_per_day"]-transit); days=max(1,math.ceil(h/eff))
            equip = days*m["spread_inr_per_day"][i]; extra={"transit_h_per_day":round(transit,2),"productive_h_per_day":m["productive_h_per_day"]}
        vessel=days*m["vessel_inr_per_day"][i]; labour=days*labour_day
        mob=g["mobilization_base_inr"]+dist_km*g["transit_cost_per_km_inr"]
        disp=max(g["disposal_min_inr"], kg[i]*g["disposal_inr_per_kg"][i])
        sub=labour+equip+vessel+mob+disp; total=round(sub*(1+g["contingency_pct"]))
        res.append(dict(days=days,labour=labour,equipment=equip,vessel=vessel,mobilization=mob,disposal=round(disp),total=total,**extra))
    out["min"],out["max"]=res
    return out

def estimate(depth, items, dist_km=None):
    g=CFG["global"]; dist_km=dist_km or g["default_distance_km"]; cls=CFG["debris_classes"]
    hmin=sum(c["min"]*cls[k]["h"][0] for k,c in items.items()); hmax=sum(c["max"]*cls[k]["h"][1] for k,c in items.items())
    kmin=sum(c["min"]*cls[k]["kg"][0] for k,c in items.items()); kmax=sum(c["max"]*cls[k]["kg"][1] for k,c in items.items())
    heaviest=max(cls[k]["kg"][1] for k in items)
    modes=[]
    for name,m in CFG["modes"].items():
        if m["depth_m"][0]<=depth<=m["depth_m"][1] and heaviest<=m["max_item_kg"]:
            if m["kind"]=="human" and depth>g["hard_max_human_depth_m"]: continue
            modes.append(estimate_mode(name,m,depth,(hmin,hmax),(kmin,kmax),dist_km))
    # recommendation: beyond prefer_robotics_beyond_m choose cheapest robotics; else cheapest overall
    pool=[x for x in modes if x["kind"]=="robotics"] if depth>g["prefer_robotics_beyond_m"] and any(x["kind"]=="robotics" for x in modes) else modes
    rec=min(pool,key=lambda x:(x["min"]["total"]+x["max"]["total"])/2)
    warn=[]
    if rec["mode"]=="work_class_rov" and hmax<12: warn.append("Work-class spread is disproportionate for <12 h of work: batch with other piles or defer.")
    if rec["risk"] in("high","very_high"): warn.append("Human diving at this depth is high risk: confirm with a diving contractor; robotics preferred if feasible.")
    return {"warnings":warn,"depth_m":depth,"item_hours":[round(hmin,2),round(hmax,2)],"debris_kg":[round(kmin,2),round(kmax,2)],
            "recommended":rec["mode"],"modes":modes}

CASES={
 "screenshot_1000m": (1000,{"other_debris":{"min":8,"max":12},"trash_bag":{"min":2,"max":3},"clothing":{"min":1,"max":2}}),
 "shallow_5m":       (5,   {"other_debris":{"min":8,"max":12},"trash_bag":{"min":2,"max":3},"clothing":{"min":1,"max":2}}),
 "scuba_25m_net":    (25,  {"trash_net":{"min":1,"max":2},"trash_rope":{"min":2,"max":4},"trash_bottle":{"min":10,"max":20}}),
 "ssa_45m_wreck":    (45,  {"trash_wreckage":{"min":1,"max":1},"trash_pipe":{"min":2,"max":4}}),
 "mixed_gas_75m":    (75,  {"trash_net":{"min":2,"max":3},"trash_container":{"min":2,"max":3}}),
 "rov_150m":         (150, {"trash_net":{"min":1,"max":2},"trash_tarp":{"min":1,"max":2}}),
}
if __name__=="__main__":
    json.dump(CFG,open("cleanup_assumptions.json","w"),indent=2)
    gold={k:estimate(d,i) for k,(d,i) in CASES.items()}
    json.dump({"inputs":{k:{"depth_m":d,"items":i} for k,(d,i) in CASES.items()},"expected":gold},open("golden_test_cases.json","w"),indent=2)
    for k,v in gold.items():
        print(k,"hours",v["item_hours"],"rec",v["recommended"])
        for m in v["modes"]: print("   ",m["mode"],m["crew"],"crew; ₹",m["min"]["total"],"-",m["max"]["total"],"days",m["min"]["days"],"-",m["max"]["days"])
