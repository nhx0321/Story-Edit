import Link from 'next/link';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">&larr; 返回工作台</Link>
        <h1 className="text-2xl font-bold mt-4 mb-8">用户协议与免责声明</h1>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 text-sm text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">一、服务说明</h2>
            <p>Story Edit（以下简称&quot;本平台&quot;）是一个AI辅助写作工具，提供小说创作、剧本改编、提示词生成等功能。本平台的AI能力由第三方大语言模型（LLM）提供，通过Token中转服务为用户提供服务。</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">二、模板内容版权</h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>用户在模板广场上传的原创模板，其著作权归上传者所有。</li>
              <li>用户上传模板即视为授予本平台非独占的展示、分发权。</li>
              <li>官方提供的免费模板归本平台所有，用户可自由使用。</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">三、禁止行为</h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li><strong>禁止复制分发付费模板内容</strong>：用户不得将通过购买或导入获得的付费模板内容以任何形式复制、传播、转售或发布于本平台以外的任何地方。</li>
              <li>不得利用本平台生成违法、暴力、色情或其他违反中国法律法规的内容。</li>
              <li>不得利用API接口进行任何形式的滥用，包括但不限于高频请求、恶意爬取等。</li>
              <li>不得将平台分配的API Key转借、转售或公开分享。</li>
              <li>不得通过任何技术手段规避平台的付费检测和内容保护机制。</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">四、Token服务条款</h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Token 是平台内的消费单位，用于AI模型调用计费。Token 一经购买不可退款，法律法规另有规定的除外。</li>
              <li>免费用户每日 Token 使用量受平台限制，具体额度以页面展示为准。</li>
              <li>平台保留根据运营需要调整Token定价和使用策略的权利，调整前将提前公告。</li>
              <li>API Key的速率限制由平台设定，频繁超限可能导致Key被临时或永久禁用。</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">五、内容保护机制</h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>本平台采用SimHash内容指纹技术检测用户创作内容是否包含付费模板片段。</li>
              <li>如检测到用户内容与付费模板高度相似，平台将提示用户并获得授权后方可继续使用。</li>
              <li>付费模板导入的项目不支持导出功能，以防止内容泄露。</li>
              <li>模板广场的付费模板仅展示标题、标签和前200字预览，完整内容需付费后获取。</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">六、创作者收益</h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>创作者上传模板获得的收益包括：模板销售收入、点赞收益（1精灵豆/赞）。</li>
              <li>收益以人民币计价，1精灵豆 = 0.01元。旧版精灵豆可迁移到Token账户。</li>
              <li>最低提现金额为10元，提现申请提交后由平台审核处理。</li>
              <li>平台有权对异常收益行为进行调查和处理。</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">七、免责声明</h2>
            <ol className="list-decimal pl-5 space-y-2">
              <li>AI生成内容仅供参考，不构成任何专业建议。用户应自行判断AI输出的准确性和适用性。</li>
              <li>本平台不对AI模型的可用性、响应速度、输出质量做任何保证。</li>
              <li>因上游AI服务商故障导致的Token损失，平台将尽力协调但不承担赔偿责任。</li>
              <li>用户通过API Key在站外调用本平台服务，其使用行为由用户自行承担全部责任。</li>
              <li>本协议的解释、变更和终止权归本平台所有，更新后的协议将在平台公布后生效。</li>
            </ol>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-2">八、联系我们</h2>
            <p>如对本协议有任何疑问或建议，请通过平台内的&quot;帮助&quot;页面或反馈功能联系我们。</p>
          </section>

          <div className="pt-4 border-t border-gray-100 text-xs text-gray-400">
            最后更新：2026年4月26日
          </div>
        </div>
      </div>
    </main>
  );
}
