"""Gia Lai Knowledge Base — 12 categories for RAG"""
from app.services.rag.vector_store import KnowledgeDocument, VectorStoreProvider
import time

DOCS = [
    ("gia_lai_geo", "Gia Lai Geography", "Gia Lai is a province in Central Highlands, Vietnam. Capital Pleiku. Area 15,511 km2. Borders Kon Tum, Binh Dinh, Phu Yen, Dak Lak. Central coordinates 13.9N,108.3E. BBox 107.3,13.1,109.4,14.7. Terrain mountainous, elevation 80-900m.", "geography", "Gia Lai Statistical Yearbook", "2024-01-15", "Gia Lai"),
    ("gia_lai_forest", "Gia Lai Forests", "Gia Lai has 600k ha forest, including Kon Ka Kinh National Park, Kon Chu Rang. Forest types: evergreen, semi-deciduous. Primary threats: fire, illegal logging, shifting cultivation. NDVI healthy >0.6, NDMI >0.4 indicates good moisture.", "forests", "Gia Lai Forest Protection Dept", "2024-03-10", "Kon Ka Kinh"),
    ("gia_lai_agri", "Gia Lai Agriculture - Coffee & Pepper", "Gia Lai is top coffee producer in Vietnam (100k ha, 250k tons). Pepper 15k ha. Coffee zones: Chu Prong, Ia Grai, Pleiku. Health indicators: NDVI 0.45-0.72 healthy, water stress when NDMI <0.2, rainfall deficit <10mm/7d.", "agriculture", "Gia Lai Agri Dept", "2024-02-20", "Chu Prong"),
    ("gia_lai_fire_reg", "Forest Fire Regulations Vietnam", "Vietnam forest fire warning 5 levels: I Very Low, II Low, III Moderate, IV High, V Extremely High (Circular 10/2021). Official warning issued by Provincial People's Committee. AI prediction is NOT official.", "forest-fire regulations", "MARD Circular 10/2021", "2021-06-15", "Vietnam"),
    ("gia_lai_disaster", "Gia Lai Disaster Profile", "Flood risk in An Khe, Vinh Thanh; landslide in mountain communes; drought in dry season Jan-Apr; storm from East Sea. Multi-hazard early warning uses rainfall, terrain slope, NDMI anomaly.", "disaster", "Gia Lai Disaster Management", "2024-04-05", "Gia Lai"),
    ("gia_lai_climate", "Gia Lai Climate", "Tropical monsoon: rainy May-Oct, dry Nov-Apr. Temp 22-28C avg, anomaly +2.8C indicates heat stress. Rainfall -37% vs baseline indicates drought/fire risk. Wind >18km/h toward populated area increases risk.", "local climate", "Open-Meteo / NASA POWER", "2024-05-01", "Gia Lai"),
    ("gia_lai_eudr", "EUDR Context Gia Lai", "EUDR requires deforestation-free evidence after 2020-12-31. Gia Lai coffee/pepper plots need GPS polygon, satellite forest-change evidence, supply chain trace. Risk LOW if no forest loss, MEDIUM if 0-15% overlap, HIGH if >15%.", "EUDR context", "EU Regulation 2023/1115", "2023-06-20", "Gia Lai"),
    ("gia_lai_carbon", "Carbon Context Gia Lai", "Forest biomass estimate: area_ha * 150 * 0.47 * veg_factor. Uncertainty +/-30%. ESTIMATE not VERIFIED/CERTIFIED. MRV requires field measurement.", "carbon context", "Carbon MRV Guide", "2024-01-30", "Gia Lai"),
    ("gia_lai_resources", "Gia Lai Public Environmental Resources", "Resources: Gia Lai DONRE, Forest Protection Dept, Hydro-meteo Center, Open-Meteo, NASA FIRMS, Sentinel Hub, GEE. Data provenance required: source, provider, timestamp, resolution.", "local public/environmental resources", "Gia Lai DONRE", "2024-03-01", "Gia Lai"),
    ("eco_product", "EcoChain Product Documentation", "Gia Lai EcoChain: Provincial Eco-Operating System. Loop: Data → AI Detection → Risk → Verification → Human Decision → Action → Learning. Master Agent routes to Forest/Fire/Disaster/Agriculture/Carbon/EUDR/Weather/Logistics/Verification agents.", "competition/product documentation", "Gia Lai EcoChain Docs", "2026-09-01", "Gia Lai"),
    ("gia_lai_coffee_zones", "Coffee Zones Detail", "Chu Prong: 30k ha coffee, basalt soil, elevation 300-500m. Ia Grai: 25k ha, near Cambodia border. Stress when NDVI drops >15% 7d, NDMI <0.29 vs baseline 0.43 (-32% HIGH severity).", "agriculture", "Gia Lai Coffee Assoc", "2024-06-10", "Chu Prong"),
    ("gia_lai_forest_change", "Forest Change Detection", "Forest change via NDVI/NDMI/NBR. Burn scar NBR <-0.25. Sentinel-2 True/False/NDVI/NDMI/NBR, Sentinel-1 VV/VH for flood/forest change. Cloud <20% required.", "forests", "Copernicus/GEE", "2024-07-15", "Gia Lai"),
]

def seed_gia_lai(store: VectorStoreProvider):
    if hasattr(store, 'docs') and len(store.docs) > 0:
        return
    for id, title, content, cat, source, ts, loc in DOCS:
        doc = KnowledgeDocument(id=id, title=title, content=content, category=cat, source=source, timestamp=ts, location=loc)
        store.add_document(doc)
