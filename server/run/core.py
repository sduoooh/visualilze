import os
import asyncio

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import math

class Sponge(nn.Module):
    def __init__(self, thickness, dt, v, f):
        super(Sponge, self).__init__()
        self.kernel = torch.FloatTensor([[[[[0,0,0],[0,1,0],[0,0,0]],[[0,1,0],[1,-6,1],[0,1,0]],[[0,0,0],[0,1,0],[0,0,0]]]]]).cuda()

        self.a = (v ** 2) * (dt ** 2)
        self.dt = dt

        N = 2
        R = 1e-3
        sigma = torch.zeros_like(v, dtype=torch.float32)
        sigma0 = - (N + 1) * torch.max(v).item() * math.log(R) / ( 2 * thickness )

        for j in range(thickness):
            i = thickness - 1 - j
            damping = sigma0 * (1 - i / thickness) ** N 
            sigma[i, :, :] = damping
            sigma[:, i, :] = damping
            sigma[:, :, i] = damping
            sigma[-i-1, :, :] = damping
            sigma[:, -i-1, :] = damping
            sigma[:, :, -i-1] = damping

        self.sigma = sigma.cuda()
        self.omega = 2 * np.pi * f

    def forward(self, source_cur, p_cur: torch.Tensor, p_pre):
        p_cur += source_cur
        p_cur = p_cur.unsqueeze(0).unsqueeze(0)
        laplacian = F.conv3d(p_cur, self.kernel, padding=1)
        p_cur = p_cur.squeeze(0).squeeze(0)
        laplacian = laplacian.squeeze(0).squeeze(0)

        damping_factor = 1 + 0.5 * self.sigma * self.dt 
        term1 = 2 * p_cur - (1 - 0.5 * self.sigma * self.dt) * p_pre
        term2 = self.a * laplacian
        
        p_pre = (term1 + term2) / damping_factor
        
        # if self.omega > 0:  
        #     p_pre += 0.25 * (self.sigma / self.omega) * laplacian * self.dt

        del laplacian
        del term1, term2

        return p_pre, p_cur
    
    def destory(self):
        self.a = None
        self.sigma = None


class Forward(nn.Module):
    def __init__(self, args, v, id, run_id: list[int], save_path, ws):
        super(Forward, self).__init__()

        self.id = id
        self.save_path = save_path
        self.ws = ws
        self.run_id = run_id

        self.dt = args['timestep']
        self.nt = args['totaltimesteps']

        self.v_x = args['width']
        self.v_y = args['height']
        self.v_z = args['depth']

        self.thickness = args['thickness']

        self.width = self.v_x + 2 * self.thickness
        self.height = self.v_y + 2 * self.thickness
        self.depth = self.v_z + 2 * self.thickness

        self.epsilon = 1e-9

        self.net = Sponge(self.thickness, self.dt, v, args['wavefrequency'])

    async def forward(self, sources): 
        print(f"{self.id} 号正演开始")
        time_stride = 5
        cache_num = 5
        p_cur = torch.zeros([self.depth, self.height, self.width]).cuda()
        p_pre = torch.zeros([self.depth, self.height, self.width]).cuda()
        data = torch.zeros([cache_num, self.depth, self.height, self.width])
        mins = torch.zeros([cache_num, 1, 1, 1])
        bases = torch.zeros([cache_num, 1, 1, 1])

        for source in sources:
            p_cur.zero_()
            p_pre.zero_()
            for i in range(self.nt):
                await asyncio.sleep(0.001)
                if self.id != self.run_id[0]:
                    break
                p_cur, p_pre = self.net(source.__next__(), p_cur, p_pre)
                if i % time_stride == 0:
                    index = (i // time_stride) % cache_num
                    data[index, self.thickness:self.depth-self.thickness, self.thickness:self.height-self.thickness, self.thickness:self.width-self.thickness] = p_cur[self.thickness:self.depth-self.thickness, self.thickness:self.height-self.thickness, self.thickness:self.width-self.thickness].cpu()
                    d_min = torch.min(data[index])
                    d_max = torch.max(data[index])
                    mins[index, 0, 0, 0] = d_min
                    bases[index, 0, 0, 0] = d_max - d_min
                if (i + 1) % (time_stride * cache_num) == 0:
                    try: 
                        await self.update_wave_data((i + 1) // time_stride, data, bases, mins)
                    except Exception as e:
                        del p_cur
                        del p_pre
                        self.net.destory()
                        raise Exception(f"保存出错， {self.id} 号正演终止, 错误： {e}")
        
        del p_cur
        del p_pre
        self.net.destory()
        print(f"{self.id} 号正演结束")

    async def update_wave_data(self, fileBlockNum, data, bases, mins):
        print(f"{self.id}-{fileBlockNum} update")
        print(f"data max: {torch.max(bases + mins)}")
        print(f"data min: {torch.min(mins)}")

        with open(os.path.join(self.save_path, f"{fileBlockNum}.bin"), "wb") as f:
            bin_data = data.reshape(-1).numpy().tobytes()
            f.write(bin_data)
        arr = (data/bases).reshape(-1)
        base_arr = bases.reshape(-1)
        min_arr = mins.reshape(-1)
        bin_data = np.concatenate([base_arr, min_arr, arr]).tobytes()
        await self.ws.send_bytes(bin_data)