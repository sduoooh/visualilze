import os
import numpy as np
import struct

width = 236  # (width + 2 * thickness) % k * 64 = 0
height = 180
depth = 180

data = np.ones((depth, height, width), dtype=np.float32) * 4000 #4000 # 致密岩石 1.8 - 4.0 km/s

data[100:, :, :] = 2000#340 # 空气中声速

test_path = "C:\\Users\\1\\Desktop\\毕设\\Q\\visualilze\\test"
with open(os.path.join(test_path, "wave_data.bin"), "wb") as f:
    data_list = data.reshape(-1).tolist()
    bin_data = struct.pack(f"{len(data_list)}f" , *data_list)
    f.write(bin_data)

