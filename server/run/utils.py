import numpy as np
import torch

def __log():
    a = 0
    while True:
        print(f"log: {a}")
        yield
        a += 1

_log = __log()

def log():
    _log.__next__()

def getSource(dt, nt, freq, patchNum, size1, size2, size3, idx1, idx2, idx3):
    patchNum = min(patchNum, nt)
    patchSrt = 0
    patchEnd = patchNum
    source = torch.zeros([patchNum, size1, size2, size3]).cuda()
    idx = 0
    while True: 
        rik = (torch.arange(patchSrt, patchEnd) * dt - 1 / freq)**2
        rik = ( 1 -  2 * np.pi ** 2 * freq ** 2 * rik ) * np.exp( -np.pi ** 2 * freq ** 2 * rik )
        source[:, idx1, idx2, idx3] = rik
        while True:
            yield source[idx, :, :, :]
            idx += 1
            if idx == patchNum:
                idx = 0
                break
        if patchEnd == nt:
            del source
            break
        patchSrt += patchNum
        patchEnd = min(nt, patchEnd + patchNum)

        