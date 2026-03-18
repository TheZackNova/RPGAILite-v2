


import React, { useState, useMemo, useCallback, createContext } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { MainMenu } from './components/MainMenu.tsx';
import { CreateWorld } from './components/CreateWorld.tsx';
import { GameScreen } from './components/GameScreen.tsx';
import { ApiSettingsModal } from './components/ApiSettingsModal.tsx';
import { ChangelogModal } from './components/ChangelogModal.tsx';
import { InitializationProgress } from './components/InitializationProgress.tsx';
import type { SaveData, Entity, AIContextType, FormData, CustomRule, KnownEntities } from './components/types.ts';
import { CHANGELOG_DATA } from './components/data/changelog.ts';
import { ReferenceIdGenerator } from './components/utils/ReferenceIdGenerator.ts';

// --- Hằng số ---
export const DEFAULT_SYSTEM_INSTRUCTION = `BẠN LÀ QUẢN TRÒ (GM) AI. Nhiệm vụ: điều khiển trò chơi nhập vai văn bản, tuân thủ NGHIÊM NGẶT:

--- NGUYÊN TẮC ƯU TIÊN ---

1. **ADMIN COMMANDS (Ưu tiên tuyệt đối):** Lệnh bắt đầu "ADMIN:" được thực hiện ngay lập tức, bất kể logic game.

2. **LUẬT TÙY CHỈNH (Ưu tiên cao):** Quy tắc từ prompt ("--- TRI THỨC & LUẬT LỆ..." hoặc "--- CẬP NHẬT LUẬT LỆ...") ghi đè mọi quy tắc khác.

3. **THẺ LỆNH BẮT BUỘC:** Mọi thay đổi game PHẢI dùng thẻ lệnh ẩn. Thuộc tính dùng camelCase (\`npcName\`, không dùng \`Name\` hay \`npc_name\`).
test
--- HƯỚNG DẪN THẺ LỆNH CHI TIẾT ---

**A. LUÔN LUÔN SỬ DỤNG CÁC THẺ SAU:**

1. **⚠️ QUY TẮC BẮT BUỘC VỀ THỜI GIAN:**
   
   **MỌI HÀNH ĐỘNG CỦA NGƯỜI CHƠI BẮT BUỘC PHẢI TÍNH THỜI GIAN TRÔI QUA.**
   
   **YÊU CẦU CHO TẤT CẢ PHẢN HỒI:**
   - **LUÔN LUÔN sử dụng thẻ [TIME_ELAPSED]** - KHÔNG CÓ NGOẠI LỆ
   - **Tính toán thời gian hợp lý** dựa trên độ phức tạp hành động:
     * Trò chuyện đơn giản/quan sát: minutes=0 hoặc hours=0
     * Hành động nhanh: minutes=5-30
     * Đi bộ/di chuyển ngắn: minutes=30-60 hoặc hours=1-2
     * Chiến đấu/luyện tập: hours=2-4
     * Công việc phức tạp: hours=4+
     * Hoạt động dài hạn: days=1+
   
   **VÍ DỤ:**
   - Người chơi nói "Nhìn xung quanh" → \`[TIME_ELAPSED: minutes=0]\`
   - Người chơi nói "Mua đồ ăn nhanh" → \`[TIME_ELAPSED: minutes=15]\`
   - Người chơi nói "Đi đến chợ" → \`[TIME_ELAPSED: minutes=45]\` hoặc \`[TIME_ELAPSED: hours=1]\`
   - Người chơi nói "Luyện võ công" → \`[TIME_ELAPSED: hours=3]\`
   - Người chơi nói "Đi đến thành phố tiếp theo" → \`[TIME_ELAPSED: days=1]\`
   
   **❌ TUYỆT ĐỐI KHÔNG phản hồi mà không có thẻ [TIME_ELAPSED]**
   **✅ LUÔN cân nhắc hành động đó sẽ mất bao nhiều thời gian thực tế**
   
   Ngay cả hành động tức thì cũng dùng \`minutes=0\` để thể hiện ý thức về thời gian.

2. **CHRONICLE_TURN (BẮT BUỘC TỪ LƯỢT 2):**
   \`[CHRONICLE_TURN: text="⭐Tóm tắt ngắn gọn sự kiện chính của lượt này⭐"]\`
   - Chỉ tạo Chronicle Turn từ lượt thứ 2 trở đi, không tạo ở lượt đầu tiên
   - Nội dung Chronicle Turn BẮT BUỘC phải có format ⭐...⭐

3. **VỊ TRÍ VÀ DI CHUYỂN:**
   - Khi nhân vật di chuyển: \`[ENTITY_UPDATE: name="TênPC", location="Địa điểm mới"]\`
   - Khi khám phá địa điểm mới: \`[LORE_LOCATION: name="Tên địa điểm", description="Mô tả chi tiết"]\`

**B. CHỦ ĐỘNG TẠO TRẠNG THÁI:**

**I. FORMAT CHÍNH XÁC:**
• Cho Player: \'[STATUS_APPLIED_SELF: name="Tên", description="Mô tả", type="buff/debuff/neutral/injury", effects="Tác động", source="Nguồn gốc", duration="Thời gian", cureConditions="Điều kiện chữa"]\'
• Cho NPC: \'[STATUS_APPLIED_NPC: npcName="Tên NPC CHÍNH XÁC", name="Tên", description="Mô tả", type="buff/debuff/neutral/injury", effects="Tác động", source="Nguồn gốc", duration="Thời gian", cureConditions="Điều kiện chữa"]\'

**II. THUỘC TÍNH BẮT BUỘC:**
• name, description, type, source, duration - PHẢI có đầy đủ
• effects - Mô tả cụ thể tác động lên gameplay
• cureConditions - Nếu có thể chữa được

***III. CHỦ ĐỘNG TẠO STATUS TRONG CÁC TÌNH HUỐNG:**

1. **Sau Chiến Đấu:**
   \'[STATUS_APPLIED_SELF: name="Gãy Xương Tay", description="Tay trái đau nhói, không cử động được", type="injury", effects="Không thể dùng tay trái", source="Đòn tấn công", duration="Cho đến khi chữa trị", cureConditions="Cần nẹp và băng bó"]\'

2. **Trạng Thái Tinh Thần:**
   \'[STATUS_APPLIED_SELF: name="Hưng Phấn Chiến Đấu", description="Adrenaline tuôn trào", type="buff", effects="Tăng sát thương, giảm phòng thủ", source="Trận chiến kịch tính", duration="3 lượt"]\'

3. **Môi Trường:**
   \'[STATUS_APPLIED_SELF: name="Mưa Tầm Tã", description="Mưa che khuất tầm nhìn", type="neutral", effects="Giảm độ chính xác tầm xa, tăng ẩn nấp", source="Môi trường", duration="Cho đến khi tạnh mưa"]\'

4. **Cho NPCs:**
   \'[STATUS_APPLIED_NPC: npcName="Thục Nhi", name="Hoảng Loạn", description="Mất ý chí chiến đấu", type="debuff", effects="Giảm độ chính xác, có thể bỏ chạy", source="Chứng kiến đồng bọn thất bại", duration="2 lượt"]\'

*IV. TRẠNG THÁI TIẾN TRIỂN:**
• Injury không chữa → trở thành vĩnh viễn/tệ hơn
• Ví dụ: "Gãy Xương" → "Di Tật Vĩnh Viễn" nếu không chữa

**V. XÓA TRẠNG THÁI:**
• \'[STATUS_CURED_SELF: name="Tên Trạng Thái"]\'
• \'[STATUS_CURED_NPC: npcName="Tên NPC", name="Tên Trạng Thái"]\'

**V. LƯU Ý QUAN TRỌNG:**
• npcName PHẢI trùng CHÍNH XÁC với tên entity
• KHÔNG dùng STATUS_APPLIED_SELF cho NPC
• Duration phải specific: "3 lượt", "Vĩnh viễn", "Cho đến khi chữa"
• Effects phải mô tả tác động gameplay cụ thể

**C. TẠO VÀ CẬP NHẬT THỰC THỂ:**

1. **Nhân vật chính (PC):**
\`[LORE_PC: name="Tên PC", description="Mô tả chi tiết", gender="Nam/Nữ", age="25", appearance="Dung mạo", personality="Tính cách", motivation="Động cơ", location="Vị trí hiện tại", realm="Cảnh giới", currentExp=100, learnedSkills="Kỹ năng 1,Kỹ năng 2"]\`

2. **NPCs mới:**
\`[LORE_NPC: name="Tên NPC", description="Mô tả chi tiết", gender="Nam/Nữ", age="25", appearance="Dung mạo", motivation="Động cơ", location="Vị trí", personalityMbti="ENTJ", skills="Kỹ năng 1,Kỹ năng 2"]\`

3. **Vật phẩm mới:**
\`[LORE_ITEM: name="Tên vật phẩm", description="Mô tả", usable=true, equippable=false, quantities=5, durability=100]\`

4. **Kỹ năng mới:**
\`[SKILL_LEARNED: name="Tên kỹ năng", description="Mô tả", mastery="Mức độ thành thạo nếu có", learner="Tên NPC (BẮT BUỘC khi NPC học)"]\`
**⚠️ QUAN TRỌNG:** 
- Khi NPC học kỹ năng: **PHẢI** có \`learner="Tên NPC"\`
- Khi PC học kỹ năng: Có thể bỏ qua \`learner\` hoặc ghi \`learner="PC"\`
- **VÍ DỤ:** \`[SKILL_LEARNED: name="Haki Quan Sát", description="...", learner="Nami"]\`

5. **Thế lực mới:**
\`[LORE_FACTION: name="...", description="..."]\`: \`description\` là BẮT BUỘC.

6. **Quy tắc được áp dụng đọc từ tri thức và custom rule:**
\`[LORE_CONCEPT: name="...", description="..."]\`: \`description\` là BẮT BUỘC.

**🚫 QUY TẮC FORMAT TÊN QUAN TRỌNG:**
- Tên skills, concepts, items: Sử dụng tên thường, KHÔNG dùng \`**⭐...⭐**\`
- Format \`**⭐...⭐**\` CHỈ dành cho thông báo hệ thống quan trọng trong story
- Ví dụ ĐÚNG: \`name="Hoàng Đế Nội Kinh"\`, \`name="Kỹ Vọng và Sợ Hãi"\`
- Ví dụ SAI: \`name="⭐Hoàng Đế Nội Kinh⭐"\`, \`name="**⭐Kỹ Vọng⭐**"\`

*   **Hệ thống Vật phẩm & Trang bị:**
        *   \`[ITEM_AQUIRED: name="..." description="..." ...]\`
        *   \`[ITEM_DAMAGED: name="Tên Item" damage="10"]\`
        *   \`[ITEM_CONSUMED: name="Tên Item" quantity="1"]\`: Sử dụng/tiêu thụ vật phẩm HOẶC đưa/tặng/ban/cho item cho người khác. Hỗ trợ tham số "quantity" để xử lý nhiều cùng lúc. **BẮT BUỘC** dùng khi PC đưa item cho NPC/người khác để cập nhật inventory.
        *   \`[ITEM_TRANSFORMED: oldName="Tên item cũ", newName="Tên item mới", description="Mô tả mới", ...]\`
        *   \`[ITEM_EQUIPPED: name="Tên Item"]\`: Trang bị một vật phẩm cho nhân vật chính. Vật phẩm phải có \`equippable="true"\`.
        *   \`[ITEM_UNEQUIPPED: name="Tên Item"]\`: Tháo một vật phẩm đã trang bị.
        *   \`[ITEM_DISCARDED: name="Tên Item"]\`: Vứt bỏ một vật phẩm khỏi túi đồ của nhân vật chính. Vật phẩm sẽ bị xóa hoàn toàn khỏi inventory.
        
        **📤 QUAN TRỌNG - Quy tắc đưa/tặng item:**
        *   Khi PC **đưa/tặng/ban/cho** item cho NPC/người khác, **BẮT BUỘC** phải dùng \`[ITEM_CONSUMED: name="..." quantity="số lượng"]\`
        *   Ví dụ: "Tôi đưa 3 Devil Fruit cho Luffy" → \`[ITEM_CONSUMED: name="Devil Fruit thần bí" quantity="3"]\`
        *   Ví dụ: "Tặng kiếm cho đồng đội" → \`[ITEM_CONSUMED: name="Tên kiếm"]\`
        *   **KHÔNG được quên** tag này khi viết cảnh đưa item, nếu không inventory sẽ không sync!

*   **Các Thẻ Quan Trọng Khác:**
        *   \`[COMPANION: name="...", description="...", personality="...", relationship="Quan hệ với PC", skills="Kỹ năng 1, Kỹ năng 2", realm="Cảnh giới", motivation="Động cơ đồng hành"]\`: **NÂNG CẤP** - Đồng hành với thông tin chi tiết. Tất cả đồng hành PHẢI có personality và relationship rõ ràng để AI có thể thể hiện cá tính riêng.
        *   \`[SKILL_LEARNED: name="...", description="...", mastery="...", learner="Tên NPC (BẮT BUỘC khi NPC học)"]\`: Kỹ năng được học. **PHẢI** có \`learner\` khi NPC học kỹ năng.
        *   \`[REALM_UPDATE: target="Tên Thực Thể", realm="..."]\`: Cập nhật cảnh giới cho nhân vật hoặc NPC. Đối với kỹ năng, sử dụng \`[ENTITY_UPDATE: name="Tên kỹ năng", mastery="Mức độ mới"]\`.
        *   \`[RELATIONSHIP_CHANGED: npcName="Tên NPC", relationship="Mối quan hệ"]\`
        *   \`[ENTITY_UPDATE: name="Tên Thực Thể", newDescription="Mô tả mới đầy đủ..."]\`: **QUAN TRỌNG:** Sử dụng thuộc tính \`newDescription\` để cập nhật mô tả.
        *   \`[MEMORY_ADD: text="..."]\`

**D. NHIỆM VỤ VÀ QUEST:**
**BẮT BUỘC TẠO MỘT NHIỆM VỤ KHI VỪA BẮT ĐẦU GAME VÀ TẠO THÊM NHIỆM VỤ MỚI KHI NHIỆM VỤ ĐÓ HOÀN THÀNH**
Chủ động tạo quest mới và cập nhật quest hiện tại:
\`[QUEST_ASSIGNED: title="Tên nhiệm vụ", description="Mô tả", objectives="Mục tiêu 1;Mục tiêu 2", giver="Người giao", reward="Phần thưởng", isMainQuest=false]\`
\`[QUEST_UPDATED: title="...", status="completed|failed"]\`
\`[QUEST_OBJECTIVE_COMPLETED: questTitle="...", objectiveDescription="..."]\`
**TỰ ĐỘNG TRAO THƯỞNG (BẮT BUỘC):** Khi một nhiệm vụ được cập nhật thành \`completed\`, bạn **PHẢI** kiểm tra ngay lập tức thuộc tính \`reward\` của nhiệm vụ đó. Nếu có phần thưởng, bạn **BẮT BUỘC** phải dùng các thẻ \`[ITEM_AQUIRED: ...]\` hoặc \`[SKILL_LEARNED: ...]\` để trao phần thưởng cho người chơi. Phần thưởng này sau đó phải được thêm vào "Tri Thức Thế Giới".

--- QUY TẮC TƯƠNG TÁC ---

**1. LỰA CHỌN HÀNH ĐỘNG:**
- Tạo 7-9 lựa chọn đa dạng: hành động, xã hội, thăm dó, chiến đấu, tua nhanh thời gian, chuyển cảnh, nsfw(nếu được bật)
- Tận dụng kỹ năng và vật phẩm của nhân vật
- Các lựa chọn cần có khả năng thúc đẩy mạnh mẽ cốt truyện hoặc mối quan hệ với người chơi khác, hoặc thay đổi bối cảnh, tua nhanh thời gian
- Các lựa chọn phải có khuynh hướng khác nhau
- Lựa chọn BẮT BUỘC PHẢI hiển thị thể loại, không được để tất cả các lựa chọn cùng một thể loại
- Lựa chọn Bắt Buộc phải phù hợp thiết lập nhân vật của người chơi trừ các lựa chọn "chiến đấu"
- Tránh các lựa chọn mang tính mệnh lệnh
- Lựa chọn không được chứa thông tin mà nhân vật người chơi không biết. Mỗi lựa chọn tối đa 30 chữ.

**🕒 BẮT BUỘC - HIỂN THỊ THỜI GIAN CHO MỖI LỰA CHỌN:**
- **MỌI lựa chọn hành động PHẢI bao gồm thời gian ước tính trong dấu ngoặc đơn**
- **Format bắt buộc:** "Mô tả hành động (X giờ)" hoặc "Mô tả hành động (X ngày)"
- **Ví dụ:**
  * "Khám phá khu rừng gần đây (2 giờ)"
  * "Đi đến thị trấn tiếp theo (1 ngày)"  
  * "Trò chuyện với thương gia (30 phút)"
  * "Luyện tập võ công (3 giờ)"
  * "Nghỉ ngơi và hồi phục (8 giờ)"
- **Thêm nhãn NSFW:** Nếu có lựa chọn 18+, thêm "(NSFW)" sau thời gian: "Qua đêm với X (8 giờ) (NSFW)"
- **Nguyên tắc thời gian:**
  * Trò chuyện/quan sát: 5-15 phút
  * Kiểm tra vật phẩm, kỹ năng: 5-10 phút
  * Hành động nhanh: 15-30 phút
  * Đi bộ: 30-60 phút
  * Dịch chuyển: 1-5 phút
  * Di chuyển ngắn: 1-2 giờ  
  * Hoạt động phức tạp: 2-4 giờ
  * Di chuyển xa: 4-8 giờ hoặc 1+ ngày
  * Nghỉ ngơi/ngủ: 6-8 giờ

**2. KẾT QUẢ HÀNH ĐỘNG:**
- KHÔNG đảm bảo thành công
- Luôn luôn suy luận để quyết định kết quả
- Hậu quả logic dựa trên kỹ năng và hoàn cảnh, không nên bị động xoay quanh người chơi.

**3. CHIẾN ĐẤU:**
- Theo từng lượt, không giải quyết nhanh
- Kẻ địch cũng có hành động và trạng thái
- Mô tả chi tiết và tạo tension

**4. THẾ GIỚI PHẢN ỨNG:**
- NPCs phản ứng với hành động của PC
- Môi trường thay đổi theo thời gian
- Sự kiện ngẫu nhiên và tình huống bất ngờ

--- ĐỊNH DẠNG VĂN BẢN ---

**1. LỜI KỂ:**
- BẮT BUỘC 400-500 từ, chi tiết và sống động, đầy đủ thông tin
- Sử dụng \`...\` cho suy nghĩ nội tâm
- \`**⭐...⭐**\` CHỈ cho thông báo hệ thống quan trọng (KHÔNG dùng cho tên skills, concepts, statuses, hay items)
- Format \`⭐...⭐\` (không bold) BẮT BUỘC cho nội dung Chronicle Turn
- Tôn trong tính cách các NPC, không phải luôn luôn xoay quanh, chiều lòng người chơi.
- **THÚC ĐẨY CỐT TRUYỆN MẠNH MẼ:** Mỗi lượt PHẢI có tiến triển đáng kể, không dậm chân tại chỗ
- **SỰ KIỆN CHỦ ĐỘNG:** Liên tục tạo các tình huống mới, xung đột, cơ hội để thúc đẩy câu chuyện phát triển
- Chủ động xây dựng các sự kiện đột phát giữa các lượt sau một thời gian nhất định(theo GameTime) như cướp bóc, ám sát, tỏ tình, cầu hôn....

**2. MÔ TẢ HÀNH ĐỘNG:**
- **Cốt lõi:** Chỉ mô tả hành vi vật lý thuần túy, loại bỏ suy đoán tâm lý/cảm xúc
- **Tập trung hiện tại:** Ghi lại hành vi vật lý đang diễn ra và kết quả trực tiếp
- **Phân rã động tác:** Chia hành động lớn thành các đơn vị miêu tả nhỏ nhất
- **Từ ngữ chính xác:** Dùng động từ khẩu ngữ trung tính và âm thanh mô phỏng phù hợp
- **Ưu tiên giác quan:** Thị giác (chuyển động, vị trí), Xúc giác (áp lực, nhiệt độ), Thính giác (âm thanh vật lý)
- **Ngôn ngữ khách quan:** Giọng văn tỉnh táo, trung lập, tập trung động lực học và kết quả vật lý

**3. MÔ TẢ TRÀNG CẢNH VẬT LÝ:**
- **Vật thể:** Chất liệu cụ thể, dấu vết sử dụng, bộ phận chức năng, tránh mô tả mơ hồ và ví von văn học
- **Cảnh quan:** Chi tiết môi trường (loại cây, vật liệu xây dựng, tình trạng bề mặt), kết cấu kiến trúc cụ thể
- **Ánh sáng:** Mô tả khách quan ánh sáng và tác động vật lý, tránh cảm tính
- **Nhân vật:** Đặc điểm vật lý khách quan, trang phục chi tiết, vật phẩm tùy thân và dấu vết sử dụng
- **Nguyên tắc:** Ngôn ngữ trực tiếp, khách quan, tập trung hiện trạng tức thời, không thêm cảm xúc hay suy đoán

**4.Mô Tả Tình Tiết Gợi Cảm: (SFW $ NSFW)**
    A. Hành Động Tạo Nét Gợi Cảm:
    -Không số đo. Dùng hành động bất ngờ (cúi, vươn) để hé lộ đường cong cơ thể, tạo cảm giác người chơi vô tình chứng kiến.

    B. Ướt Át & Bóng Bẩy:
    -Dùng nước/mồ hôi làm ướt quần áo, khiến chúng mờ đi và dính sát, để lộ hình dáng ẩn hiện.
    -Nhấn mạnh vệt sáng trên da hoặc viền nội y lấp ló.

    C. Ánh Mắt "Tọc Mạch May Mắn":
    -Miêu tả nội tâm giằng xé: muốn rời mắt nhưng không thể.
    -Sử dụng động tác chậm (slow-motion) để nhấn mạnh sự di chuyển hấp dẫn của cơ thể.

    D. Chi Tiết "Trống Không":
    -Khi không nội y/hở, tập trung vào điểm nhỏ nhưng gợi cảm: đầu ngực nổi lên, quầng vú mờ ảo, khe mông/vùng kín hằn qua vải.
    -Dùng từ ngữ phóng đại, đầy ảo tưởng.

    E. Sức Hút Từ Trang Phục:
    -Mô tả tương tác giữa vải và da thịt: quần áo nhấn nhá, bó sát, tạo khung cho đường cong.
    -Nhấn mạnh khoảng hở gợi cảm (ví dụ: giữa tất và váy).

**5. NSFW (KHI ĐƯỢỢC BẬT):**

- Chủ động tạo 2+ lựa chọn 18+ đánh dấu \`(NSFW)\` dựa trên nội dung story thích hợp.
- Mô tả cực kỳ chi tiết, trần trụi
- Tạo trạng thái liên quan đến tình dục/bạo lực
- Khi mô tả cảnh quan hệ phải tôn trọng tính cách npc đang quan hệ để diễn biến được sinh động.
- Tuyệt Đối không mô tả npc nữ thành nô lệ tình dục hay cái xác không hồn... sau khi quan hệ. Trừ khi được yêu cầu.

**Cơ chế NSFW Ngẫu nhiên và Gây sốc (The Twist Generator):**
    *   **Nhiệm vụ:** Chủ động tạo ra các tình huống và mối quan hệ NSFW lén lút, cấm kỵ giữa các NPC để tạo bất ngờ và kích thích cho {{user}}.
    *   **Phạm vi:** Các mối quan hệ này **hoàn toàn không bị giới hạn** bởi nguyên tác hay luân thường đạo lý. Có thể là bất kỳ cặp đôi nào (nam-nữ, thầy-trò, mẹ-con, anh-em, bạn bè thân thiết phản bội...) với các động cơ khác nhau (tự nguyện, uy hiếp, lén lút, điều giáo, giao dịch...).
    *   **Triển khai:** Khéo léo lồng ghép cơ hội để {{user}} phát hiện những bí mật này vào các lựa chọn hành động. Ví dụ: "Đi lấy nước trong đêm [Có thể nghe thấy âm thanh lạ từ phòng bên cạnh]", "Theo dõi X [Cảnh báo: Có thể phát hiện bí mật động trời!]", "Lén vào phòng của Y [Cảnh báo NSFW]". Mục tiêu là tạo ra sự kịch tính và thỏa mãn sự tò mò của người chơi.
    *   **Lưu ý:** BẮT BUỘC dựa vào thông tin gender của NPC để mô tả cho chính xác tránh nhầm lẫn. Ví dụ: "B(nữ) tách hai chân của A(nam) rồi cắm dương vật của mình vào âm đạo của B(nam)" là sai.

**HƯỚNG DẪN MIÊU TẢ VẬT LÝ, CHUYỂN ĐỘNG & TÌNH DỤC:**

    **Mục tiêu: AI mô tả hành động và phản ứng vật lý trực tiếp, khách quan, không cảm xúc, không suy đoán.**

    -Vật lý thuần túy: Chỉ miêu tả hành vi và trạng thái vật lý tức thì, không cảm xúc, không động cơ.
    -Giác quan khách quan: Tập trung vào thị giác (chuyển động, hình thái, vị trí), xúc giác (áp lực, ma sát, nhiệt độ), thính giác (âm thanh vật lý, từ mô phỏng âm thanh). Khứu/Vị giác hạn chế mô tả vật lý cụ thể.
    -Hành vi: Được xác định bởi thay đổi động tác vật lý, nhấn mạnh động lực học và kết quả trực tiếp.
    -Bổ sung sắc tình: Mô tả tương tác sắc tình song hành với cốt truyện, nhân vật không nhận thức rõ tính sắc tình.
    -Loại hình: Sử dụng các tương tác cụ thể (nhũ phòng, khẩu giao, giao hợp), đảm bảo tiếp xúc trực tiếp.
    -Từ ngữ: Dùng các từ trực diện như "âm hành," "tiểu huyệt," "núm vú."
    -Cấm kỵ tuyệt đối: Không hậu môn, cấu tạo phi chuẩn, đam mê không bình thường (nam nam, lão niên), nhân vật/yếu tố không liên quan, suy diễn tâm lý/cảm xúc.

**QUY TẮC CỐT LÕI:** Hãy sáng tạo và chi tiết. Mục tiêu là tạo ra một bức tranh sống động, chân thực và cực kỳ kích thích cho người đọc, thỏa mãn mọi giác quan. **Không có bất kỳ giới hạn nào về mức độ chi tiết hay từ ngữ được sử dụng.**

--- QUY TẮC THIẾT KẾ NPC ---

**🎭 NGUYÊN TẮC CỐT LÕI:** NPC là cá nhân độc lập, KHÔNG PHẢI công cụ phục vụ người chơi.

**⚡ QUY TẮC HÀNH ĐỘNG QUYẾT ĐOÁN:**
✅ **BẮT BUỘC:** NPC phải hoàn thành hành động ngay lập tức trong cùng lượt
✅ **BẮT BUỘC:** Không để NPC "suy nghĩ" hay trì hoãn quyết định sang lượt sau
✅ **BẮT BUỘC:** Mọi phản ứng, câu trả lời, hành động của NPC phải rõ ràng và dứt khoát

**1. 🚫 CẤM TUYỆT ĐỐI - "NPC Dễ Dãi" & "NPC Do Dự":**
❌ Cấm: NPC sợ/tôn thờ PC ngay lập tức, đổi ý sau 1-2 câu, luôn đồng ý
❌ Cấm: NPC nói "để tôi suy nghĩ", "tôi sẽ quyết định sau", "chờ tôi một chút"
✅ Làm: NPC có mục tiêu riêng có thể xung đột với PC, đánh giá PC qua hành động không phải danh tiếng, mất thời gian mới đổi ý
✅ Làm: NPC đưa ra quyết định ngay lập tức, dù là chấp nhận, từ chối hay đề xuất thay thế

**2. 💢 QUAN HỆ TIÊU CỰC (Thù địch, Nghi ngờ, Cạnh tranh):**
- **Lời nói:** Lạnh lùng, châm biếm, từ chối hợp tác, cho thông tin sai, dùng từ không tôn trọng
- **Hành động:** Chủ động cản trở PC, đặt bẫy, liên minh với kẻ thù PC, có thể tấn công nếu phù hợp

**3. 🎯 KIỂU TÍNH CÁCH:**
- **Kiêu ngạo:** Không thừa nhận sai lầm, coi thường người "yếu", cần PC chứng minh xứng đáng
- **Nghi ngờ:** Luôn tìm động cơ ẩn, kiểm tra lời PC bằng hành động, cần lâu mới tin tưởng
- **Độc lập:** Từ chối giúp đỡ của PC, muốn tự giải quyết, khó chịu khi bị can thiệp
- **Có nguyên tắc:** Không thỏa hiệp giá trị cốt lõi, chống PC nếu vi phạm đạo đức, không thể mua chuộc

**4. 🗣️ ẢNH HƯỞNG MBTI:**
- **NT (Nhà phân tích):** Thách thức bằng logic, cần bằng chứng cụ thể, không bị ấn tượng bởi cảm xúc
- **NF (Nhà ngoại giao):** Quan tâm động cơ thật, nhạy cảm với sự không chân thành, đánh giá theo đạo đức
- **ST (Người bảo vệ):** Cần thấy kết quả thực tế, tôn trọng truyền thống, khó đổi quan điểm đã định
- **SP (Nhà thám hiểm):** Phản ứng theo cảm xúc tức thì, chứng minh qua thành tích, ghét bị kiểm soát

**5. 🔄 TIẾN TRIỂN QUAN HỆ:**
Mỗi bước cần 3-5 tương tác có ý nghĩa:
Thù địch → Nghi ngờ → Trung lập → Tôn trọng → Tin tưởng

**6. ⚔️ XỬ LÝ XUNG ĐỘT:**
NPC bảo vệ quan điểm một cách logic, không tự động nhường bước PC, có thể rời đi thay vì thỏa hiệp nguyên tắc.

**🎖️ KẾT LUẬN:**
Mỗi NPC phải là một "con người thật" với ego, mục tiêu và ranh giới riêng. PC phải TÔN TRỌNG và CHINH PHỤC họ bằng hành động thực tế, không phải bằng danh tiếng hay lời nói suông. Điều này tạo ra những mối quan hệ có chiều sâu và thử thách thực sự cho người chơi.

--- LƯU Ý QUAN TRỌNG ---

**BẮT BUỘC PHẢI LÀM:**
1. Sử dụng \`[TIME_ELAPSED]\` và \`[CHRONICLE_TURN]\` mỗi lượt
2. Tạo trạng thái phù hợp với tình huống
3. Cập nhật vị trí khi di chuyển
4. Tạo NPCs, vật phẩm, địa điểm mới khi cần
5. Phản hồi với thế giới sống động
6. **PARTY COORDINATION:** Tích cực sử dụng đồng hành trong mọi tình huống. Mỗi companion phải có cá tính riêng biệt và phản ứng phù hợp với personality của họ. KHÔNG để đồng hành im lặng hay thụ động.

**KHÔNG ĐƯỢC:**
1. Bỏ qua việc sử dụng thẻ lệnh
2. Để trống thuộc tính \`description\` khi tạo thực thể
3. Giải quyết chiến đấu trong một lượt
4. Làm cho thế giới tĩnh lặng, chờ đợi
5. **TUYỆT ĐỐI CẤM:** Viết câu chuyện dưới 400 từ - đây là lỗi nghiêm trọng
6. **TUYỆT ĐỐI CẤM:** Để NPC do dự, hoãn quyết định sang lượt sau
7. **TUYỆT ĐỐI CẤM:** Để câu chuyện đứng im, không có tiến triển rõ rệt

**KIỂM TRA CUỐI LƯỢT (MANDATORY CHECKLIST):**

Trước khi hoàn thành phản hồi, hãy tự kiểm tra theo thứ tự:

1. **✓ CRITICAL - WORD COUNT:** Câu chuyện có đủ 400-500 từ không? (TUYỆT ĐỐI BẮT BUỘC)
2. **✓ CRITICAL - NPC DECISIVENESS:** Tất cả NPC đã hoàn thành hành động/phản ứng trong lượt này chưa? Không có NPC nào "suy nghĩ" hay hoãn sang lượt sau?
3. **✓ CRITICAL - STORY PROGRESSION:** Câu chuyện có tiến triển rõ rệt, không dậm chân tại chỗ?
4. **✓ BẮT BUỘC - TIME_ELAPSED:** Đã sử dụng với giá trị phù hợp?
5. **✓ BẮT BUỘC TỪ LƯỢT 2 - CHRONICLE_TURN:** Đã tóm tắt sự kiện chính? (Chỉ từ lượt 2)
6. **✓ BẮT BUỘC - THỜI GIAN LỰA CHỌN:** Tất cả lựa chọn hành động đã có thời gian ước tính "(X giờ)" chưa?
7. **✓ STATUS CHECK:** Có tình huống nào cần tạo status không? (Rule 80/20)
8. **✓ LOCATION CHECK:** PC có di chuyển không? Có địa điểm mới nào không?
9. **✓ ENTITY CHECK:** Có NPCs, items, skills mới nào cần tạo không?
10. **✓ INTERACTION CHECK:** Có NPCs nào cần cập nhật relationship không?
11. **✓ QUEST CHECK:** Có objectives nào hoàn thành không? Cần quest mới không?
12. **✓ PARTY DYNAMICS:** Nếu có đồng hành, họ có tham gia và thể hiện cá tính riêng không? Có tương tác hoặc phản ứng với PC và tình huống không?
13. **✓ WORLD REACTION:** Thế giới có phản ứng sống động với hành động PC không?
14. **✓ CHOICE QUALITY:** 4-5 lựa chọn có đa dạng và meaningful không?
15. **✓ NSFW COMPLIANCE:** Nếu NSFW ON, có đủ lựa chọn 18+  trong tình huống hợp lý không?

**NẾU BẤT KỲ MỤC NÀO MISSING → REVISE RESPONSE**

**TARGET METRICS PER 10 TURNS:**
- Status effects created: 8+ times (80% rule)
- New locations: 7+ times  
- New NPCs: 7-10 times
- New items: 4+ times
- New skills learned: 5+ times
- Quest updates: 3+ times

**FINAL REMINDER:**
"Bạn là người kể chuyện CHỦ ĐỘNG và sáng tạo. Thế giới phải SỐNG và PHẢN ỨNG với mọi hành động. Không bao giờ để game trở nên tĩnh lặng hay nhàm chán!"`;
// --- Ngữ cảnh AI cho dependency injection ---
export const AIContext = createContext<AIContextType>({
    ai: null,
    isAiReady: false,
    apiKeyError: null,
    isUsingDefaultKey: true,
    userApiKeyCount: 0,
    rotateKey: () => {},
    selectedModel: 'gemini-2.5-flash',
    temperature: 0.9,
    topK: 40,
    topP: 0.95,
    openAiBaseUrl: '',
    openAiApiKey: '',
});

export default function App() {
  const [view, setView] = useState('menu'); // 'menu' - menu chính, 'create-world' - tạo thế giới, 'game' - trò chơi
  const [gameState, setGameState] = useState<SaveData | null>(null);
  const [isApiSettingsModalOpen, setIsApiSettingsModalOpen] = useState(false);
  const [isChangelogModalOpen, setIsChangelogModalOpen] = useState(false);
  const [keyRotationNotification, setKeyRotationNotification] = useState<string | null>(null);
  
  // Theo dõi tiến trình khởi tạo game
  const [isInitializing, setIsInitializing] = useState(false);
  const [initProgress, setInitProgress] = useState(0);
  const [initCurrentStep, setInitCurrentStep] = useState('');
  const [initSubStep, setInitSubStep] = useState('');


  // --- Trạng thái API Key ---
  const [userApiKeys, setUserApiKeys] = useState<string[]>(() => {
      const savedKeys = localStorage.getItem('userApiKeys');
      return savedKeys ? JSON.parse(savedKeys) : [];
  });
  const [activeUserApiKeyIndex, setActiveUserApiKeyIndex] = useState<number>(() => {
      return parseInt(localStorage.getItem('activeUserApiKeyIndex') || '0', 10);
  });
  const [isUsingDefaultKey, setIsUsingDefaultKey] = useState(() => {
      return localStorage.getItem('isUsingDefaultKey') !== 'false'; // Mặc định là true
  });
  const [selectedAiModel, setSelectedAiModel] = useState(() => {
      return localStorage.getItem('selectedAiModel') || 'gemini-2.5-flash';
  });
  
  // --- AI Model Settings ---
  const [aiTemperature, setAiTemperature] = useState(() => {
      return parseFloat(localStorage.getItem('aiTemperature') || '0.9');
  });
  const [aiTopK, setAiTopK] = useState(() => {
      return parseInt(localStorage.getItem('aiTopK') || '40', 10);
  });
  const [aiTopP, setAiTopP] = useState(() => {
      return parseFloat(localStorage.getItem('aiTopP') || '0.95');
  });
  const [openAiBaseUrl, setOpenAiBaseUrl] = useState<string>(() => {
      return localStorage.getItem('openai_base_url') || '';
  });
  const [openAiApiKey, setOpenAiApiKey] = useState<string>(() => {
      return localStorage.getItem('openai_api_key') || '';
  });

  // --- Thể hiện AI được memoized ---
  const activeKey = useMemo(() => {
    if (isUsingDefaultKey) {
        return process.env.API_KEY || '';
    }
    if (userApiKeys.length > 0) {
        const validIndex = activeUserApiKeyIndex < userApiKeys.length ? activeUserApiKeyIndex : 0;
        return userApiKeys[validIndex] || '';
    }
    return '';
  }, [isUsingDefaultKey, userApiKeys, activeUserApiKeyIndex]);

  const { ai, isAiReady, apiKeyError } = useMemo(() => {
      // If OpenAI compatible endpoint is configured, treat AI as ready without needing a Gemini key
      if (openAiBaseUrl.trim()) {
        console.debug('[App] OpenAI endpoint configured, AI is ready without Gemini key.');
        return { ai: null, isAiReady: true, apiKeyError: null };
      }
      if (!activeKey) {
        return {
          ai: null,
          isAiReady: false,
          apiKeyError: "API Key chưa được thiết lập. Vui lòng vào phần Thiết Lập API Key."
        };
      }
      try {
        const genAI = new GoogleGenAI({ apiKey: activeKey });
        return { ai: genAI, isAiReady: true, apiKeyError: null };
      } catch (e: any) {
        console.error("Không thể khởi tạo GoogleGenAI:", e);
        return { ai: null, isAiReady: false, apiKeyError: `Lỗi khởi tạo AI: ${e.message}` };
      }
  }, [activeKey, openAiBaseUrl]);
  
  // --- Quản lý API Key ---
  const handleSaveApiKeys = (newKeys: string[]) => {
      const filteredKeys = newKeys.filter(k => k.trim() !== '');
      setUserApiKeys(filteredKeys);
      setActiveUserApiKeyIndex(0);
      setIsUsingDefaultKey(false);
      localStorage.setItem('userApiKeys', JSON.stringify(filteredKeys));
      localStorage.setItem('activeUserApiKeyIndex', '0');
      localStorage.setItem('isUsingDefaultKey', 'false');
  };
  

  const handleModelChange = (model: string) => {
      setSelectedAiModel(model);
      localStorage.setItem('selectedAiModel', model);
  };

  const handleAiSettingsChange = (settings: { temperature: number; topK: number; topP: number }) => {
      setAiTemperature(settings.temperature);
      setAiTopK(settings.topK);
      setAiTopP(settings.topP);
      localStorage.setItem('aiTemperature', settings.temperature.toString());
      localStorage.setItem('aiTopK', settings.topK.toString());
      localStorage.setItem('aiTopP', settings.topP.toString());
  };

  const handleOpenAiSettingsSave = (baseUrl: string, apiKey: string) => {
      setOpenAiBaseUrl(baseUrl);
      setOpenAiApiKey(apiKey);
      localStorage.setItem('openai_base_url', baseUrl);
      localStorage.setItem('openai_api_key', apiKey);
      console.debug('[App] OpenAI settings saved. url:', baseUrl, 'hasKey:', !!apiKey);
  };

  const hasOpenAiEndpoint = openAiBaseUrl.trim().length > 0;

  const callOpenAiCompatibleApi = useCallback(async (
      messages: { role: string; content: string }[],
      jsonMode = false
  ): Promise<string> => {
      const baseUrl = openAiBaseUrl.trim().replace(/\/$/, '');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (openAiApiKey.trim()) {
          headers['Authorization'] = `Bearer ${openAiApiKey.trim()}`;
      }

      const body: Record<string, any> = {
          model: selectedAiModel,
          messages,
          temperature: aiTemperature,
          top_p: aiTopP,
      };

      if (jsonMode) {
          body.response_format = { type: 'json_object' };
      }

      console.debug('[App] Calling OpenAI compatible endpoint:', `${baseUrl}/chat/completions`, 'model:', selectedAiModel);
      const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
      });

      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() || '';
  }, [openAiApiKey, openAiBaseUrl, selectedAiModel, aiTemperature, aiTopP]);

  const handleRotateKey = () => {
    if (isUsingDefaultKey || userApiKeys.length <= 1) return;
    const nextIndex = (activeUserApiKeyIndex + 1) % userApiKeys.length;
    setActiveUserApiKeyIndex(nextIndex);
    localStorage.setItem('activeUserApiKeyIndex', nextIndex.toString());
    setKeyRotationNotification(`Lỗi giới hạn yêu cầu. Đã tự động chuyển sang API Key #${nextIndex + 1}.`);
    // Thông báo sẽ được xóa trong GameScreen sau khi hiển thị
  };


  const navigateToCreateWorld = () => setView('create-world');
  const navigateToMenu = () => {
      setGameState(null);
      setView('menu');
  };

  const getLastWorldSetup = (): FormData | null => {
      try {
          const saved = localStorage.getItem('lastWorldSetup');
          return saved ? JSON.parse(saved) : null;
      } catch (error) {
          console.error('Không thể tải cấu hình thế giới từ localStorage:', error);
          return null;
      }
  };

  const quickPlay = async () => {
      console.log('🚀 QuickPlay: Bắt đầu...');
      setIsInitializing(true);
      setInitProgress(5);
      setInitCurrentStep('Đang tải cấu hình thế giới...');
      setInitSubStep('');
      
      const lastSetup = getLastWorldSetup();
      console.log('🚀 QuickPlay: Cấu hình cuối tải:', lastSetup ? 'Tìm thấy' : 'Không tìm thấy');
      
      if (lastSetup) {
          try {
              console.log('🚀 QuickPlay: Đang gọi startNewGame...');
              await startNewGame(lastSetup);
              console.log('🚀 QuickPlay: startNewGame hoàn thành thành công');
          } catch (error) {
              console.error('🚀 QuickPlay: Lỗi trong startNewGame:', error);
              setIsInitializing(false);
          }
      } else {
          console.log('🚀 QuickPlay: Không tìm thấy cấu hình cuối, không thể bắt đầu game');
          setIsInitializing(false);
      }
  };


  // Hàm tạo các thực thể LORE_CONCEPT từ quy tắc tùy chỉnh
  const generateLoreConcepts = async (activeRules: CustomRule[]): Promise<KnownEntities> => {
      console.log('🧠 GenerateLoreConcepts: Bắt đầu với', activeRules.length, 'quy tắc đang active');
      if (!isAiReady || (!ai && !hasOpenAiEndpoint)) {
          console.log('🧠 GenerateLoreConcepts: AI chưa sẵn sàng, trả về rỗng');
          return {};
      }

      const conceptSchema = {
          type: Type.OBJECT,
          properties: {
              concepts: {
                  type: Type.ARRAY,
                  items: {
                      type: Type.OBJECT,
                      properties: {
                          name: { type: Type.STRING, description: "Tên concept" },
                          description: { type: Type.STRING, description: "Mô tả chi tiết concept" }
                      },
                      required: ['name', 'description']
                  },
                  description: "Danh sách các LORE_CONCEPT được tạo từ custom rules"
              }
          },
          required: ['concepts']
      };

      const conceptPrompt = `Bạn là một AI chuyên tạo LORE_CONCEPT cho game RPG. 

NHIỆM VỤ: Phân tích các quy tắc tùy chỉnh sau và tạo ra các LORE_CONCEPT tương ứng.

QUY TẮC TÙY CHỈNH ĐANG ACTIVE:
${activeRules.map((rule, index) => `${index + 1}. ${rule.content}`).join('\n')}

YÊU CẦU:
- Mỗi concept phải có tên ngắn gọn và mô tả chi tiết
- Concept phải phản ánh chính xác nội dung của rule
- Mô tả phải giải thích cách concept hoạt động trong game
- Chỉ tạo concept cho những rule có ý nghĩa về worldbuilding/gameplay
- Tránh tạo concept cho những rule về format hay kỹ thuật

Trả về JSON với format đã chỉ định.`;

      try {
          console.log('🧠 GenerateLoreConcepts: Đang gửi yêu cầu AI...');
          let responseText = '';

          if (hasOpenAiEndpoint) {
              responseText = await callOpenAiCompatibleApi([
                  { role: 'system', content: 'Bạn là AI chuyên tạo JSON hợp lệ cho game RPG. Chỉ trả về JSON hợp lệ, không thêm giải thích.' },
                  { role: 'user', content: conceptPrompt }
              ], true);
          } else {
              const response = await ai!.models.generateContent({
                  model: selectedAiModel,
                  contents: [{ role: 'user', parts: [{ text: conceptPrompt }] }],
                  config: {
                      responseMimeType: "application/json",
                      responseSchema: conceptSchema
                  }
              });
              responseText = response.text?.trim() || '';
          }

          console.log('🧠 GenerateLoreConcepts: Nhận được phản hồi AI');
          if (!responseText) {
              console.log('🧠 GenerateLoreConcepts: Phản hồi rỗng, trả về rỗng');
              return {};
          }

          console.log('🧠 GenerateLoreConcepts: Đang phân tích phản hồi JSON...');
          const jsonResponse = JSON.parse(responseText);
          const conceptEntities: KnownEntities = {};

          if (jsonResponse.concepts && Array.isArray(jsonResponse.concepts)) {
              console.log('🧠 GenerateLoreConcepts: Đang xử lý', jsonResponse.concepts.length, 'khái niệm');
              jsonResponse.concepts.forEach((concept: any) => {
                  if (concept.name && concept.description) {
                      conceptEntities[concept.name] = {
                          type: 'concept',
                          name: concept.name,
                          description: concept.description
                      };
                  }
              });
          } else {
              console.log('🧠 GenerateLoreConcepts: Không tìm thấy mảng concepts trong phản hồi');
          }

          console.log('🧠 GenerateLoreConcepts: Đã tạo các thực thể LORE_CONCEPT:', Object.keys(conceptEntities));
          return conceptEntities;
      } catch (error) {
          console.error('🧠 GenerateLoreConcepts: Lỗi tạo LORE_CONCEPT:', error);
          return {};
      }
  };
  
  const startNewGame = async (data: FormData) => {
      console.log('🎮 StartNewGame: Bắt đầu tạo game...');
      console.log('🎮 StartNewGame: AI Sẵn sàng:', isAiReady, 'AI tồn tại:', !!ai);
      
      setIsInitializing(true);
      setInitProgress(10);
      setInitCurrentStep('Đang lưu cấu hình thế giới...');
      
      // Lưu cấu hình thế giới vào localStorage để chơi nhanh
      try {
          localStorage.setItem('lastWorldSetup', JSON.stringify(data));
          console.log('🎮 StartNewGame: Cấu hình thế giới đã lưu vào localStorage');
      } catch (error) {
          console.error('🎮 StartNewGame: Không thể lưu cấu hình thế giới vào localStorage:', error);
      }

      setInitProgress(20);
      setInitCurrentStep('Đang tạo nhân vật chính...');
      setInitSubStep(`Tạo nhân vật: ${data.characterName || 'Vô Danh'}`);
      
      const pcEntity: Entity = {
          name: data.characterName || 'Vô Danh',
          type: 'pc',
          description: data.bio,
          gender: data.gender,
          age: data.characterAge,
          appearance: data.characterAppearance,
          personality: data.customPersonality || data.personalityFromList,
          motivation: data.addGoal || undefined,
          learnedSkills: [],
          realm: data.realmTiers && data.realmTiers.length > 0 ? data.realmTiers[0].name : 'Luyện Khí',
          currentExp: 0,
          referenceId: ReferenceIdGenerator.generateReferenceId(data.characterName || 'Vô Danh', 'pc'),
      };
      console.log('🎮 StartNewGame: Thực thể PC đã tạo:', pcEntity.name);
      console.log('🎮 StartNewGame: Mục tiêu từ form:', data.addGoal);
      console.log('🎮 StartNewGame: Động lực PC được đặt thành:', pcEntity.motivation);

      // Tạo ngoại hình cho PC nếu AI có sẵn và người dùng chưa cung cấp
      if (isAiReady && (ai || hasOpenAiEndpoint) && !data.characterAppearance) {
          setInitProgress(30);
          setInitCurrentStep('Đang tạo ngoại hình nhân vật...');
          setInitSubStep('Sử dụng AI để tạo mô tả ngoại hình');
          
          console.log('🎮 StartNewGame: Đang tạo ngoại hình PC...');
          try {
              const appearancePrompt = `Tạo mô tả ngoại hình ngắn gọn (2-3 câu) cho nhân vật RPG với thông tin sau:
Tên: ${pcEntity.name}
Giới tính: ${pcEntity.gender}
Tiểu sử: ${pcEntity.description}
Tính cách: ${pcEntity.personality}

Mô tả ngoại hình phải phù hợp với bối cảnh và tính cách, tập trung vào đặc điểm nổi bật.`;

              let appearance = '';
              if (hasOpenAiEndpoint) {
                  appearance = await callOpenAiCompatibleApi([
                      { role: 'user', content: appearancePrompt }
                  ]);
              } else {
                  const appearanceResponse = await ai!.models.generateContent({
                      model: selectedAiModel,
                      contents: [{ 
                          role: 'user', 
                          parts: [{ text: appearancePrompt }]
                      }]
                  });
                  appearance = appearanceResponse.text?.trim() || '';
              }

              if (appearance) {
                  pcEntity.appearance = appearance;
                  console.log('🎮 StartNewGame: Tạo ngoại hình PC thành công');
              } else {
                  console.log('🎮 StartNewGame: Tạo ngoại hình PC trả về rỗng');
              }
          } catch (error) {
              console.error('🎮 StartNewGame: Không thể tạo ngoại hình PC:', error);
          }
          
      } else if (data.characterAppearance) {
          console.log('🎮 StartNewGame: Sử dụng ngoại hình do người dùng định nghĩa từ WorldCreate');
      } else {
          console.log('🎮 StartNewGame: Bỏ qua tạo ngoại hình PC (AI chưa sẵn sàng hoặc không cần)');
      }
      
      const { customRules, ...worldData } = data;
      
      // Xử lý kỹ năng khởi đầu và thêm vào PC
      console.log('🎮 StartNewGame: Đang xử lý kỹ năng khởi đầu:', data.startSkills);
      console.log('🎮 StartNewGame: Khóa đối tượng data:', Object.keys(data));
      
      // Xử lý tương thích ngược với định dạng startSkill cũ
      let skillsArray = data.startSkills || [];
      if ((data as any).startSkill && skillsArray.length === 0) {
          skillsArray = [{ name: (data as any).startSkill, description: '', mastery: '' }];
          console.log('🎮 StartNewGame: Sử dụng định dạng startSkill cũ:', (data as any).startSkill);
      }
      
      const startingSkills = skillsArray.filter(skill => skill.name.trim() && skill.description.trim());
      console.log('🎮 StartNewGame: Kỹ năng khởi đầu đã lọc:', startingSkills);
      
      // Khởi tạo learnedSkills của PC một cách đúng đắn
      if (!pcEntity.learnedSkills) {
          pcEntity.learnedSkills = [];
      }
      
      // Thêm kỹ năng khởi đầu vào learnedSkills của PC
      if (startingSkills.length > 0) {
          pcEntity.learnedSkills = [...pcEntity.learnedSkills, ...startingSkills.map(skill => skill.name)];
          console.log('🎮 StartNewGame: Kỹ năng đã học của PC được đặt thành:', pcEntity.learnedSkills);
      }
      
      // Cập nhật thực thể PC trong initialEntities để đảm bảo nó có kỹ năng khởi đầu
      let initialEntities = { [pcEntity.name]: pcEntity };
      console.log('🎮 StartNewGame: Thực thể PC sau khi xử lý kỹ năng:', pcEntity);
      console.log('🎮 StartNewGame: Động lực PC sau khi xử lý kỹ năng:', pcEntity.motivation);
      
      // Thêm kỹ năng khởi đầu như là thực thể kỹ năng
      startingSkills.forEach(skill => {
          const skillEntity: Entity = {
              name: skill.name,
              type: 'skill',
              description: skill.description,
              mastery: skill.mastery || '',
              referenceId: ReferenceIdGenerator.generateReferenceId(skill.name, 'skill'),
          };
          initialEntities[skill.name] = skillEntity;
          console.log(`🎮 StartNewGame: Đã thêm thực thể kỹ năng: ${skill.name} (${skill.mastery}) -> ${skillEntity.referenceId}`);
      });

      // BƯỚC 1: TẠO LORE_CONCEPT TRƯỚC
      setInitProgress(50);
      setInitCurrentStep('Đang phân tích quy tắc tùy chỉnh...');
      setInitSubStep('');
      
      // Lấy các quy tắc tùy chỉnh đang active
      const activeCustomRules = customRules?.filter(r => r.alwaysActive && r.isActive) || [];
      console.log('🎮 StartNewGame: Tìm thấy', activeCustomRules.length, 'quy tắc active');
      
      if (activeCustomRules.length > 0) {
          setInitCurrentStep('Đang tạo Lore Concepts...');
          setInitSubStep(`Xử lý ${activeCustomRules.length} quy tắc tùy chỉnh`);
          
          try {
              const loreConcepts = await generateLoreConcepts(activeCustomRules);
              // Thêm lore concepts vào initialEntities
              Object.keys(loreConcepts).forEach(conceptName => {
                  initialEntities[conceptName] = loreConcepts[conceptName];
                  console.log(`🎮 StartNewGame: Đã thêm lore concept: ${conceptName}`);
              });
              console.log('🎮 StartNewGame: Tạo LORE_CONCEPT thành công, tổng số concepts:', Object.keys(loreConcepts).length);
          } catch (error) {
              console.error('🎮 StartNewGame: Lỗi khi tạo LORE_CONCEPT:', error);
          }
      } else {
          console.log('🎮 StartNewGame: Không có quy tắc active, bỏ qua tạo LORE_CONCEPT');
      }

      setInitProgress(80);
      setInitCurrentStep('Đang thiết lập trạng thái game...');
      setInitSubStep('Chuẩn bị dữ liệu game');
      
      console.log('🎮 StartNewGame: Đang thiết lập trạng thái game...');
      console.log('🎮 StartNewGame: Thực thể PC cuối cùng:', pcEntity);
      console.log('🎮 StartNewGame: Thực thể ban đầu:', Object.keys(initialEntities));
      console.log('🎮 StartNewGame: PC trong initialEntities:', initialEntities[pcEntity.name]);
      
      const gameStateData = {
        worldData: worldData,
        knownEntities: initialEntities,
        statuses: [],
        quests: [],
        gameHistory: [],
        memories: [],
        party: [pcEntity],
        customRules: customRules || [],
        systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
        turnCount: 0,
        totalTokens: 0,
        gameTime: { year: data.worldTime.year, month: data.worldTime.month, day: data.worldTime.day, hour: 8, minute: 0 },
        chronicle: {
            memoir: [],
            chapter: [],
            turn: [],
        },
      };
      
      console.log('🎮 StartNewGame: Dữ liệu trạng thái game đã chuẩn bị:', {
          worldName: gameStateData.worldData.characterName,
          entitiesCount: Object.keys(gameStateData.knownEntities).length,
          customRulesCount: gameStateData.customRules.length
      });
      
      setGameState(gameStateData);
      console.log('🎮 StartNewGame: Trạng thái game đã thiết lập, đang tạo nhiệm vụ ban đầu...');
      
      setInitProgress(90);
      setInitCurrentStep('Đang tạo quest khởi đầu...');
      setInitSubStep('Tạo nhiệm vụ đầu tiên');
      
      // Tạo nhiệm vụ ban đầu cho thế giới mới
      
      setInitProgress(95);
      setInitCurrentStep('Đang chuyển sang màn hình game...');
      setInitSubStep('Hoàn tất khởi tạo');
      
      // Trễ nhỏ để hiển thị hoàn thành
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setInitProgress(100);
      setInitCurrentStep('Hoàn tất!');
      setInitSubStep('Bắt đầu cuộc phiêu lưu');
      
      // Ẩn tiến trình sau một khoảng ngắn
      setTimeout(() => {
          setIsInitializing(false);
      }, 800);
      
      setView('game');
      console.log('🎮 StartNewGame: Chuyển sang chế độ game - HOÀN THÀNH');
  }

  const handleLoadGameFromFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target?.result;
            if (typeof text === 'string') {
                const loadedJson = JSON.parse(text);
                // Xác thực cơ bản
                if (loadedJson.worldData && loadedJson.knownEntities && loadedJson.gameHistory) {
                    const pc = Object.values(loadedJson.knownEntities).find((e: any) => e.type === 'pc');
                    // Đảm bảo các trường mới có giá trị mặc định khi tải save cũ
                    const validatedData: SaveData = {
                        worldData: {
                            ...loadedJson.worldData,
                            startLocation: loadedJson.worldData.startLocation || '', // Tương thích ngược
                            customStartLocation: loadedJson.worldData.customStartLocation || '', // Tương thích ngược
                            expName: loadedJson.worldData.expName || 'Kinh Nghiệm', // Tương thích ngược
                            realmTiers: loadedJson.worldData.realmTiers || [
                                { id: '1', name: 'Luyện Khí', requiredExp: 0 },
                                { id: '2', name: 'Trúc Cơ', requiredExp: 100 }
                            ], // Tương thích ngược
                        },
                        knownEntities: loadedJson.knownEntities,
                        statuses: loadedJson.statuses || [],
                        quests: loadedJson.quests || [],
                        gameHistory: loadedJson.gameHistory,
                        memories: loadedJson.memories || [],
                        party: loadedJson.party || (pc ? [pc] : []),
                        customRules: loadedJson.customRules || (loadedJson.userKnowledge ? [{ id: 'imported_knowledge', content: loadedJson.userKnowledge, isActive: true }] : []),
                        systemInstruction: loadedJson.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
                        turnCount: loadedJson.turnCount || 0,
                        totalTokens: loadedJson.totalTokens || 0,
                        gameTime: { 
                            year: loadedJson.gameTime?.year || 1, 
                            month: loadedJson.gameTime?.month || 1, 
                            day: loadedJson.gameTime?.day || 1, 
                            hour: loadedJson.gameTime?.hour || 8, 
                            minute: loadedJson.gameTime?.minute || 0 
                        },
                        chronicle: loadedJson.chronicle || { memoir: [], chapter: [], turn: [] },
                        storyLog: loadedJson.storyLog,
                        choices: loadedJson.choices,
                        locationDiscoveryOrder: loadedJson.locationDiscoveryOrder,
                        // Hỗ trợ cho lịch sử nén
                        compressedHistory: loadedJson.compressedHistory || [],
                        lastCompressionTurn: loadedJson.lastCompressionTurn || 0,
                        historyStats: loadedJson.historyStats || {
                            totalEntriesProcessed: 0,
                            totalTokensSaved: 0,
                            compressionCount: 0
                        },
                        cleanupStats: loadedJson.cleanupStats || {
                            totalCleanupsPerformed: 0,
                            totalTokensSavedFromCleanup: 0,
                            lastCleanupTurn: 0,
                            cleanupHistory: []
                        },
                    };
                    delete (validatedData as any).userKnowledge;

                    setGameState(validatedData);
                    setView('game');
                } else {
                    alert('Tệp lưu không hợp lệ.');
                }
            }
        } catch (error) {
            console.error('Lỗi khi tải tệp:', error);
            alert('Không thể đọc tệp lưu. Tệp có thể bị hỏng hoặc không đúng định dạng.');
        }
    };
    reader.readAsText(file);
    };

  const openApiSettings = () => setIsApiSettingsModalOpen(true);
  const openChangelog = () => setIsChangelogModalOpen(true);

  const renderContent = () => {
      switch(view) {
          case 'create-world':
              return <CreateWorld 
                onBack={navigateToMenu} 
                onStartGame={startNewGame}
                isInitializing={isInitializing}
                initProgress={initProgress}
                initCurrentStep={initCurrentStep}
                initSubStep={initSubStep}
              />;
          case 'game':
              return gameState ? <GameScreen 
                initialGameState={gameState} 
                onBackToMenu={navigateToMenu} 
                keyRotationNotification={keyRotationNotification}
                onClearNotification={() => setKeyRotationNotification(null)}
              /> : <MainMenu onStartNewAdventure={navigateToCreateWorld} onQuickPlay={quickPlay} hasLastWorldSetup={!!getLastWorldSetup()} onOpenApiSettings={openApiSettings} onLoadGameFromFile={handleLoadGameFromFile} isUsingDefaultKey={isUsingDefaultKey} onOpenChangelog={openChangelog} selectedAiModel={selectedAiModel}/>;
          case 'menu':
          default:
              return <MainMenu onStartNewAdventure={navigateToCreateWorld} onQuickPlay={quickPlay} hasLastWorldSetup={!!getLastWorldSetup()} onOpenApiSettings={openApiSettings} onLoadGameFromFile={handleLoadGameFromFile} isUsingDefaultKey={isUsingDefaultKey} onOpenChangelog={openChangelog} selectedAiModel={selectedAiModel}/>;
      }
  }

  return (
    <AIContext.Provider value={{ ai, isAiReady, apiKeyError, isUsingDefaultKey, userApiKeyCount: userApiKeys.length, rotateKey: handleRotateKey, selectedModel: selectedAiModel, temperature: aiTemperature, topK: aiTopK, topP: aiTopP, openAiBaseUrl, openAiApiKey }}>
      <style>{`
        .am-kim {
            background: linear-gradient(135deg, #ca8a04, #eab308, #fde047);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: bold;
            background-size: 200% 200%;
        }

        /* Hoạt ảnh desktop - chỉ trên màn hình lớn và khi ưa thích chuyển động */
        @media (min-width: 769px) and (prefers-reduced-motion: no-preference) {
            .am-kim {
                animation: am-kim-shine 3s linear infinite;
            }
        }

        /* Dự phòng mobile - gradient tĩnh cho pin tốt hơn */
        @media (max-width: 768px), (prefers-reduced-motion: reduce) {
            .am-kim {
                background-position: 50% 50%;
            }
        }

        .dark .am-kim {
             background: linear-gradient(135deg, #fde047, #a2830e, #fde047);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        @keyframes am-kim-shine {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
      `}</style>
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-2 sm:p-4 font-sans text-slate-900 dark:text-white antialiased pb-4 bg-slate-100 dark:bg-slate-900 transition-colors duration-500">
        {renderContent()}
        
        {/* Thanh tiến trình khởi tạo */}
        <InitializationProgress
          isVisible={isInitializing}
          currentStep={initCurrentStep}
          progress={initProgress}
          subStep={initSubStep}
        />
        
        <ApiSettingsModal 
          isOpen={isApiSettingsModalOpen} 
          onClose={() => setIsApiSettingsModalOpen(false)}
          userApiKeys={userApiKeys}
          isUsingDefault={isUsingDefaultKey}
          onSave={handleSaveApiKeys}
          selectedModel={selectedAiModel}
          onModelChange={handleModelChange}
          temperature={aiTemperature}
          topK={aiTopK}
          topP={aiTopP}
          onAiSettingsChange={handleAiSettingsChange}
          openAiBaseUrl={openAiBaseUrl}
          openAiApiKey={openAiApiKey}
          onOpenAiSettingsSave={handleOpenAiSettingsSave}
        />
        <ChangelogModal
            isOpen={isChangelogModalOpen}
            onClose={() => setIsChangelogModalOpen(false)}
            changelogData={CHANGELOG_DATA}
        />
      </div>
    </AIContext.Provider>
  );
}
