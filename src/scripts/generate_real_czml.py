import os
import json
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone
from skyfield.api import load
from skyfield.framelib import itrs
from curl_cffi import requests

# ================= 配置区 =================
# 获取当前脚本所在文件夹的绝对路径，确保路径寻找不受终端执行位置影响
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 拼接到 data 文件夹下的 starlink.txt
TLE_FILE = os.path.join(BASE_DIR, "data", "starlink.txt") 
# 获取当前脚本所在目录：.../code/src/scripts
current_dir = os.path.dirname(os.path.abspath(__file__))
# 向上跳两级回到 code 根目录，再进入 public
OUT_FILE = os.path.abspath(os.path.join(current_dir, "..", "..", "public", "real_starlink_orbit.czml"))

# 新增：CelesTrak 活跃卫星 TLE 数据源 URL
TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"

# 轨道推演设置
SIMULATION_HOURS = 2       # 推演未来几小时的轨道
TIME_STEP_SECONDS = 60     # 每隔多少秒采一个点 (对于低轨卫星，60秒足够平滑)
# ==========================================

def update_tle_data(url, file_path):
    print(f"正在从 CelesTrak 获取最新 TLE 数据...")
    try:
        response = requests.get(url, impersonate="chrome110", timeout=30)
        
        # 检查是否成功获取 (200 OK)
        if response.status_code == 200:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, "w", encoding='utf-8') as f:
                f.write(response.text)
            print("TLE 数据下载并更新成功！\n")
        else:
            print(f"服务器返回状态码: {response.status_code}")
            print("将尝试使用本地已有的旧 TLE 数据继续执行...\n")
            
    except Exception as e:
        print(f"网络请求失败: {e}")
        print("将尝试使用本地已有的旧 TLE 数据继续执行...\n")


def main():
    # ================= 新增：执行数据更新 =================
    update_tle_data(TLE_URL, TLE_FILE)
    # ======================================================

    print(f"正在加载航天历法与 TLE 数据...")
    # 加载时间系统（初次运行会自动下载一小段星历文件到本地）
    ts = load.timescale()
    
    if not os.path.exists(TLE_FILE):
        print(f"找不到文件 {TLE_FILE}，并且网络下载失败，程序终止！")
        return

    # 解析 TLE 文件
    satellites = load.tle_file(TLE_FILE)
    print(f"成功读取 {len(satellites)} 颗卫星数据！")

    # ================= 关键修改：时间与时区 =================
    # 生成时间序列 (必须明确指定 timezone.utc，否则 Skyfield 会报错)
    start_dt = datetime.now(timezone.utc)
    end_dt = start_dt + timedelta(hours=SIMULATION_HOURS)
    
    # 构建 skyfield 的时间数组
    time_list = [start_dt + timedelta(seconds=i*TIME_STEP_SECONDS) 
                 for i in range(int(SIMULATION_HOURS * 3600 / TIME_STEP_SECONDS))]
    t = ts.from_datetimes(time_list)

    # CZML 时间戳字符串 (使用 strftime 格式化确保包含 'Z')
    start_time_str = start_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
    end_time_str = end_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
    availability_str = f"{start_time_str}/{end_time_str}"
    # =======================================================

    # 初始化 CZML 文档
    czml_document = [
        {
            "id": "document",
            "name": "Real Starlink Simulation",
            "version": "1.0",
            "clock": {
                "interval": availability_str,
                "currentTime": start_time_str,
                "multiplier": 10
            }
        }
    ]

    print(f"正在进行 SGP4 轨道推演并生成 CZML...")

    # 遍历每颗卫星，计算坐标 (为了演示，限制前 500 颗，你可以去掉切片跑全部)
    for i, sat in enumerate(satellites):
        # SGP4 推演，获取 ITRS (地球固连坐标系 ECEF) 下的坐标
        # Cesium 默认使用 ECEF 坐标系渲染实体
        geocentric = sat.at(t)
        x, y, z = geocentric.frame_xyz(itrs).m
        
        # 拼接 CZML 需要的 [time, x, y, z, time, x, y, z...] 格式
        positions = []
        for j in range(len(time_list)):
            sim_time_s = j * TIME_STEP_SECONDS
            positions.extend([sim_time_s, x[j], y[j], z[j]])

        colors = [
            [64, 158, 255, 255],   # 商务蓝
            [103, 194, 58, 255],   # 森林绿
        ]
        color_rgba = colors[i % len(colors)]

        # 构建实体节点 (不包含 orientation，完全交给前端动态计算)
        entity_node = {
            "id": f"Sat-{sat.model.satnum}",
            "name": sat.name,
            "availability": availability_str,
            "path": {
                "show": False, 
                "width": 1.5,
                "material": { "solidColor": { "color": { "rgba": [c * 0.8 for c in color_rgba][:3] + [150] } } },
                "resolution": 120
            },
            "position": {
                "epoch": start_time_str,
                "interpolationAlgorithm": "LAGRANGE",
                "interpolationDegree": 5,
                "cartesian": positions
            },
            "point": {
                "pixelSize": 4,
                "color": { "rgba": [255, 255, 255, 255] },
                "outlineColor": { "rgba": color_rgba },
                "outlineWidth": 2
            }
        }
        czml_document.append(entity_node)

    # 导出文件
    with open(OUT_FILE, "w", encoding='utf-8') as outf:
        json.dump(czml_document, outf, separators=(',', ':'), ensure_ascii=False)

    print(f"真实数据已保存为 {OUT_FILE}。")

if __name__ == "__main__":
    main()