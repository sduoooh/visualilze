import os
import numpy as np
import torch
import torch.nn as nn
import torch.backends.cudnn as cudnn
import math

import asyncio

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from core import Forward
from utils import log, getSource

app = FastAPI()

origins = ['*']

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

ws = None
run_id = [0]

def check(args):
    dx = args['argument']['dx']
    dt = args['argument']['timestep']
    v_x = args['argument']['width']
    v_y = args['argument']['height']
    v_z = args['argument']['depth']
    thickness = args['argument']['thickness']

    width = v_x + 2 * thickness
    height = v_y + 2 * thickness
    depth = v_z + 2 * thickness

    isVShader = args['argument']['isVShader']
    vAreaList = np.array(args['argument']['vAreaList'])

    vModelPath = args['filepath']

    if args['argument']['dx'] != 1:
        raise Exception("仅支持空间网格为1.")
    
    # if len(args['argument']['sourcesList']) != 1:
    #     raise Exception("仅支持单震源.")

    if min(min(width, height), depth) <= thickness:
        raise Exception("吸收层厚过厚")

    try:
        with open(vModelPath, 'rb') as file:
            bin_data = file.read()

        v = np.reshape(np.frombuffer(bin_data, dtype=np.float32), (v_z, v_y, v_x))
    except Exception as e:
        print(e) 
        raise Exception("模型尺寸不匹配")
    
    if dt > dx / (v.max() * math.sqrt(3)):
        raise Exception(f"不满足CFL条件, 其值应不大于 {dx / (v.max() * math.sqrt(3))}")

    if isVShader:
        print(v.max(), v.min(), (np.all(vAreaList >= v.min()) and np.all(vAreaList <= v.max())),(np.all(vAreaList >= v.min()), np.all(vAreaList <= v.max())))
        if not (np.all(vAreaList >= v.min()) and np.all(vAreaList <= v.max())):
            raise Exception("异常体速度范围设置超出速度模型速度范围")
        if not np.all(vAreaList[:, 0] <= vAreaList[:, 1]):
            raise Exception("异常体速度下限应不超过上限")
        
    pad_width = ((thickness, thickness), (thickness, thickness), (thickness, thickness))
    v = np.pad(v, pad_width, mode='edge')

    return ([width, height, depth, 0.006, thickness], v) # 雷克子波最大振幅为1, 考虑到区域极值和可视性， 取2


async def init(args, v, id):

    dt = args['argument']['timestep']
    nt = args['argument']['totaltimesteps']
    freq = args['argument']['wavefrequency']
    thickness = args['argument']['thickness']

    v_x = args['argument']['width']
    v_y = args['argument']['height']
    v_z = args['argument']['depth']

    sources = args['argument']['sourcesList']

    vModelPath = args['filepath']

    save_path = os.path.join(os.path.dirname(vModelPath), "wave_data")
    if not os.path.exists(save_path):
        os.mkdir(save_path)

    width = v_x + 2 * thickness
    height = v_y + 2 * thickness
    depth = v_z + 2 * thickness

    srs = []
    for source_point in sources:
        source_width = source_point[0] + thickness
        source_height = source_point[1] + thickness
        source_depth = source_point[2] + thickness
        source = getSource(dt, nt, freq, 50, depth, height, width, source_depth, source_height, source_width)
        srs.append(source)
    
    v = torch.from_numpy(v).float().cuda()

    cudnn.benchmark = True
    torch.cuda.empty_cache()
    if id != run_id[0]:
        print(f"{id} 号正演结束")
        return
    model = Forward(args=args['argument'], v=v, id=id, run_id=run_id, save_path=save_path, ws=ws)
    model = model.cuda()

    await model(srs)

def gen_v(args, v: np.ndarray):
    if not args['isVShader']:
        return np.zeros_like(v, dtype=np.float32)
    
    thickness = args['thickness'] + 1

    v_model = np.zeros_like(v, dtype=np.float32)

    area_mask = np.zeros_like(v_model, dtype=bool)
    area_mask_mask = np.ones_like(v_model, dtype=bool)

    temp = np.zeros_like(v_model, dtype=np.int8)
    core = np.zeros([3, 3, 3], dtype=np.int8)
    core[1,1,:] = 1
    core[1,:,1] = 1
    core[:,1,1] = 1
    core[1,1,1] = -6
    core = torch.from_numpy(core).unsqueeze(0).unsqueeze(0)

    area_mask_mask[thickness:-thickness, thickness:-thickness, thickness:-thickness] = False

    vAreas = args['vAreaList']
    v_base = 0.9 / (len(vAreas) + 1)
    vAreas.sort(key=lambda x: x[0])
    
    for index, border in enumerate(vAreas):
        area_max = border[1]
        area_min = border[0] 
        area_mask = (v <= area_max) & (v >= area_min)
        v_model[area_mask] = 0.05 + v_base * (index + 1)

        temp_copy = temp.copy()
        temp_copy[area_mask] = 1

        temp_copy = nn.functional.conv3d(torch.from_numpy(temp_copy).unsqueeze(0).unsqueeze(0), core, padding=1)[0][0].numpy()
        area_mask = temp_copy <= -1
        area_mask[area_mask_mask] = False
        v_model[area_mask] = 2

    v_model = v_model / 2
    
    return v_model

async def tasker(args, id):
    try:
        size, v = check(args)
        print("初始化完成")
        await ws.send_json({
            "success": True,
            "size": size,
        })

        v_model = gen_v(args['argument'], v)

        await ws.send_bytes(v_model.tobytes())
        del v_model

        await init(args, v, id)

    except Exception as e:
        print(str(e))
        await ws.send_json({
            "success": False,
            "data": str(e),
        })
    torch.cuda.empty_cache()
    
@app.websocket("/vsi/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    global run_id
    global ws

    ws = websocket
    await websocket.accept()
    try:
        while True:
            print("looping...")
            command = await websocket.receive_json()
            print(command)
            if command["type"] == "paramUpdate":
                asyncio.create_task(tasker(command["data"], run_id[0]))
                print("waiting next loop.")
                
            elif command["type"] == "stop":
                run_id[0] += 1
                print("stop")

            elif command["type"] == "restart":
                run_id[0] += 1
                print("restart")
                asyncio.create_task(tasker(command["data"], run_id[0]))

    except Exception as e:
        run_id[0] += 1
        print(f"Connection closed: {e}")
        torch.cuda.empty_cache()    

import subprocess
@app.get("/vsi/api/chooseFile")
async def getPath():
    res = subprocess.run('python ./server/run/fileChoose.py', capture_output=True)
    if res.returncode:
        return {"filePath": ''}
    return {"filePath": str(res.stdout, encoding='gbk').strip()}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)