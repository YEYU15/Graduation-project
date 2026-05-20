import json
import math
import os
from datetime import datetime, timezone

def generate_singularity_czml():
    # 初始化 CZML 文档头
    czml = [
        {
            "id": "document",
            "name": "Attitude Singularity Test Data",
            "version": "1.0"
        }
    ]

    start_time_str = "2024-01-01T00:00:00Z"
    earth_radius_plus_alt = 7000000.0 # 假设轨道半径 7000 公里

    # ==========================================
    # 用例 1: 同向奇异点 (径向运动)
    # 物理意义: 卫星在 X 轴上向外直飞。
    # 触发条件: 速度 V 与星下线 N 都在 X 轴上，N x V = 0
    # ==========================================
    radial_positions = []
    # 生成 100 秒的数据，每 10 秒向外移动 10 公里
    for i in range(11):
        time_offset = i * 10
        x = earth_radius_plus_alt + (i * 10000) 
        y = 0.0
        z = 0.0
        radial_positions.extend([time_offset, x, y, z])

    czml.append({
        "id": "Singularity-1-Radial",
        "name": "同向奇异点测试 (N x V = 0)",
        "availability": "2024-01-01T00:00:00Z/2024-01-01T00:01:40Z",
        "point": {
            "color": {"rgba": [255, 0, 0, 255]}, # 红色标记
            "pixelSize": 10
        },
        "position": {
            "epoch": start_time_str,
            "cartesian": radial_positions
        }
    })

    # ==========================================
    # 用例 2: 极地奇异点 (完美过极点)
    # 物理意义: 卫星在 X-Z 平面绕行，必定经过 (0, 0, R)
    # 触发条件: 过北极点时，N 与全局 Z 轴完美平行，N x Z = 0
    # ==========================================
    polar_positions = []
    # 模拟从赤道 (0度) 飞越北极 (90度) 到另一侧赤道 (180度)
    # 步长为 10 度，确保 90 度 (极点) 被精确计算到
    for i in range(19):
        angle_deg = i * 10
        angle_rad = math.radians(angle_deg)
        time_offset = i * 60 # 假设每过 10 度需要 60 秒
        
        x = earth_radius_plus_alt * math.cos(angle_rad)
        y = 0.0
        z = earth_radius_plus_alt * math.sin(angle_rad)
        polar_positions.extend([time_offset, x, y, z])

    czml.append({
        "id": "Singularity-2-Polar",
        "name": "极地奇异点测试 (N x Z = 0)",
        "availability": "2024-01-01T00:00:00Z/2024-01-01T00:18:00Z",
        "point": {
            "color": {"rgba": [0, 255, 0, 255]}, # 绿色标记
            "pixelSize": 10
        },
        "position": {
            "epoch": start_time_str,
            "cartesian": polar_positions
        }
    })

    # ==========================================
    # 指定输出目录与文件保存逻辑
    # ==========================================
    target_dir = r"C:\Users\yeyu\Desktop\code\public"
    
    # 检查文件夹是否存在，如果不存在则自动创建
    if not os.path.exists(target_dir):
        os.makedirs(target_dir)
        print(f"文件夹不存在，已自动创建: {target_dir}")

    # 拼接完整的文件路径
    output_filename = os.path.join(target_dir, "test_singularities.czml")
    
    # 写入文件
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(czml, f, indent=4, ensure_ascii=False)
    
    print(f"✅ 测试数据已成功生成并保存至: {output_filename}")

if __name__ == "__main__":
    generate_singularity_czml()